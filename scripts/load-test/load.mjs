// Load test against the local copy of the Hyderabad Rishta database (same migrations as live).
// Every call runs exactly like PostgREST does it: a transaction as role `authenticated` with the
// member's JWT subject, then the same RPC the app / discover-feed edge function calls.
//   node load.mjs <users> <seconds> <concurrency>
import pg from 'pg';

const USERS = +process.argv[2] || 150;
const SECONDS = +process.argv[3] || 60;
const CONC = +process.argv[4] || 50;
const pool = new pg.Pool({ host: '127.0.0.1', user: 'postgres', password: process.env.PGPASSWORD, database: 'rishta_load', max: CONC });
const uid = (i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
const ADMIN = '00000000-0000-4000-8000-ad0000000001';
const stats = new Map();
const errors = new Map();
const rnd = (n) => Math.floor(Math.random() * n);

async function call(name, user, sql, params = []) {
  const c = await pool.connect();
  const t0 = performance.now();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true)", [user]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    const k = `${name}: ${e.message.slice(0, 60)}`;
    errors.set(k, (errors.get(k) || 0) + 1);
    return null;
  } finally {
    const ms = performance.now() - t0;
    if (!stats.has(name)) stats.set(name, []);
    stats.get(name).push(ms);
    c.release();
  }
}

const profileIds = (await pool.query("select id, user_id, profile_type from profiles where status = 'published'")).rows;
const byUser = new Map(profileIds.map((p) => [p.user_id, p]));

// One member's visit to the app.
async function session(i) {
  const me = uid(i);
  const mine = byUser.get(me);
  const show = mine?.profile_type === 'bride' ? 'groom' : 'bride';
  // Open Discover (what discover-feed does)
  await call('get_feed_context', me, 'select get_feed_context($1) as r', [['all']]);
  const rows = (await call('search_profiles', me, 'select * from search_profiles($1, null, null, null, null, null, null, 50, 0) r', [show])) || [];
  const ids = rows.map((r) => (r.search_profiles || r.r || r).id).filter(Boolean).slice(0, 30);
  await call('get_featured', me, 'select * from get_featured(30, $1)', [ids.slice(0, 10)]);
  await call('save_feed_state', me, 'select save_feed_state($1, $2, $3, now(), now(), null)', ['all', 's' + i, ids]);
  await call('record_impressions', me, 'select record_impressions($1)', [ids.slice(0, 8)]);
  // Look at 2 profiles
  for (let k = 0; k < 2 && ids.length; k++) await call('get_profile', me, 'select get_profile($1)', [ids[rnd(ids.length)]]);
  // Shortlist toggle (table write, like the app)
  if (ids.length) {
    const pid = ids[rnd(ids.length)];
    const del = await call('shortlist_toggle', me, 'delete from shortlists where user_id = $1 and profile_id = $2 returning 1', [me, pid]);
    if (del && !del.length) await call('shortlist_toggle', me, 'insert into shortlists (user_id, profile_id) values ($1, $2) on conflict do nothing', [me, pid]);
  }
  // Send an interest ~40% of visits (some with a number offer)
  if (ids.length && Math.random() < 0.4) {
    const offer = Math.random() < 0.5;
    await call('send_request', me, 'select send_request($1, $2, $3, $4, $5)', [ids[rnd(ids.length)], 'Assalamu alaikum, we liked the biodata.', offer, offer, 'k' + i + '-' + Date.now() + rnd(1e6)]);
  }
  // Inbox: requests, answer pending ones, share numbers
  const reqs = (await call('get_requests', me, 'select get_requests(null) r')) || [];
  for (const row of reqs.slice(0, 3)) {
    const v = row.r;
    if (!v) continue;
    if (v.direction === 'received' && v.request?.status === 'pending') {
      await call('respond_request', me, 'select respond_request($1, $2)', [v.request.id, Math.random() < 0.7 ? 'accepted' : 'declined']);
    } else if (v.request?.status === 'accepted' && !v.myOffer && Math.random() < 0.5) {
      await call('offer_phone', me, 'select offer_phone($1, true, $2)', [v.request.id, 'o' + i + '-' + Date.now()]);
    } else if (v.theirOffer?.status === 'offered') {
      await call('respond_phone_offer', me, 'select respond_phone_offer($1, $2)', [v.theirOffer.id, 'accepted']);
    }
  }
  await call('get_notifications', me, 'select get_notifications(200)');
  await call('get_my_activity', me, 'select get_my_activity()');
  if (Math.random() < 0.3) await call('get_shortlist', me, 'select get_shortlist()');
}

async function adminVisit() {
  await call('admin_stats', ADMIN, 'select admin_stats()');
  await call('admin_list_users', ADMIN, 'select count(*) from admin_list_users()');
  await call('admin_list_profiles', ADMIN, 'select count(*) from admin_list_profiles(null)');
  await call('admin_search', ADMIN, 'select count(*) from admin_search($1)', ['Load1']);
  await call('admin_get_member', ADMIN, 'select admin_get_member($1)', [uid(1 + rnd(USERS))]);
}

const end = Date.now() + SECONDS * 1000;
let visits = 0;
async function worker(w) {
  while (Date.now() < end) {
    if (w === 0) await adminVisit();
    else await session(1 + rnd(USERS));
    visits++;
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));
const secs = (Date.now() - t0) / 1000;

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const rowsOut = [...stats.entries()].map(([k, a]) => {
  a.sort((x, y) => x - y);
  return { call: k, n: a.length, p50: pct(a, 50), p95: pct(a, 95), p99: pct(a, 99), max: a[a.length - 1] };
}).sort((a, b) => b.p95 - a.p95);
const total = rowsOut.reduce((s, r) => s + r.n, 0);
console.log(`users=${USERS} concurrency=${CONC} seconds=${secs.toFixed(0)} visits=${visits} calls=${total} (${(total / secs).toFixed(0)}/s)`);
console.log('call'.padEnd(22), 'n'.padStart(6), 'p50'.padStart(8), 'p95'.padStart(8), 'p99'.padStart(8), 'max'.padStart(8), ' (ms)');
for (const r of rowsOut) console.log(r.call.padEnd(22), String(r.n).padStart(6), r.p50.toFixed(1).padStart(8), r.p95.toFixed(1).padStart(8), r.p99.toFixed(1).padStart(8), r.max.toFixed(1).padStart(8));
const errTotal = [...errors.values()].reduce((s, n) => s + n, 0);
console.log(`errors: ${errTotal}`);
for (const [k, n] of [...errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('  ', n, k);
const counts = (await pool.query("select (select count(*) from contact_requests) req, (select count(*) from contact_requests where status='accepted') acc, (select count(*) from phone_offers where status='accepted') nums, (select count(*) from shortlists) sl, (select count(*) from notifications) notes, (select count(*) from boost_impressions) impr")).rows[0];
console.log('activity created:', JSON.stringify(counts));
await pool.end();
