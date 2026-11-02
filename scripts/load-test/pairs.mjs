// Two-person sharing check on the safe copy: 100 couples at the same time, each step verified from
// BOTH sides plus a stranger. Path by couple number:
//   0: he offers his number with the interest; she accepts, shares photo and her number (a swap).
//   1: plain interest; she accepts, shares photo, offers her number one-sided; he taps "Show number".
//   2: plain interest; she accepts; then BOTH offer numbers at the same instant.
import pg from 'pg';
const pool = new pg.Pool({ host: '127.0.0.1', user: 'postgres', password: process.env.PGPASSWORD, database: 'rishta_load', max: 60 });
const id = (k) => `00000000-0000-4000-8000-5a000000${k}`;
const STRANGER = id(3001);
const fails = new Map();
const passes = new Map();
const check = (name, ok, info = '') => {
  if (ok) passes.set(name, (passes.get(name) || 0) + 1);
  else { const a = fails.get(name) || []; a.push(info); fails.set(name, a); }
};
async function as(user, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true)", [user]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) { await c.query('rollback').catch(() => {}); return { error: e.message }; } finally { c.release(); }
}
const profileOf = async (u) => (await pool.query('select id from profiles where user_id = $1', [u])).rows[0].id;
const view = async (viewer, pid) => { const r = await as(viewer, 'select get_profile($1) v', [pid]); return r.error ? { error: r.error } : r[0].v; };
const sees = (v) => ({ photo: !!(v && v.photos && v.photos.length), number: !!(v && v.contact && v.contact.phone), error: v && v.error });

async function couple(n) {
  const him = id(1001 + n), her = id(2001 + n), path = n % 3;
  const hisP = await profileOf(him), herP = await profileOf(her);
  const tag = `couple ${n} path ${path}`;
  let s = sees(await view(him, herP));
  check('1. before anything: he sees no photo, no number', !s.photo && !s.number, tag);
  const offer = path === 0;
  const sent = await as(him, 'select (send_request($1, $2, $3, $4, $5)).id', [herP, 'Assalamu alaikum', offer, offer, 'pair-' + n]);
  const req = sent[0]?.id;
  check('2. interest sent', !!req, tag + ' ' + JSON.stringify(sent));
  s = sees(await view(her, hisP));
  check('3. before she accepts: she does not see his number', !s.number, tag);
  check('4. respond_request accepted', !(await as(her, 'select respond_request($1, $2)', [req, 'accepted'])).error, tag);
  s = sees(await view(her, hisP));
  if (offer) check('5. he offered with interest: she sees his number right after accepting', s.number, tag);
  else check('5. he did not offer: she does not see his number', !s.number, tag);
  s = sees(await view(him, herP));
  check('6. accepted but nothing shared yet: he sees no photo, no number', !s.photo && !s.number, tag);

  if (path !== 2) {
    check('7. she shares photos', !(await as(her, 'select set_consent($1, true, false, false)', [req])).error, tag);
    s = sees(await view(him, herP));
    check('8. he now sees her photo', s.photo, tag);
    const o = await as(her, 'select (offer_phone($1, true, $2)).status', [req, 'pairo-' + n]);
    check('9. she offers her number', !o.error, tag + ' ' + JSON.stringify(o));
    s = sees(await view(him, herP));
    if (path === 0) check('10. swap: he sees her number at once (no extra tap)', s.number, tag);
    else {
      check('10. one-sided: he does not see it until he taps', !s.number, tag);
      const off = await as(him, "select id from phone_offers where request_id = $1 and from_user_id = $2 and status = 'offered'", [req, her]);
      check('11. he taps Show number', !(await as(him, 'select respond_phone_offer($1, $2)', [off[0]?.id, 'accepted'])).error, tag);
      s = sees(await view(him, herP));
      check('12. after the tap he sees her number', s.number, tag);
      s = sees(await view(her, hisP));
      check('13. she still does not see HIS number (he never offered)', !s.number, tag);
    }
    const notes = await as(him, "select count(*)::int n from notifications where user_id = $1 and deep_link = '/profile/' || $2", [him, herP]);
    check('14. his bell notices open her profile', notes[0]?.n > 0, tag);
  } else {
    // both press "Share my number" at the same moment
    const [a, b] = await Promise.all([
      as(him, 'select (offer_phone($1, true, $2)).status', [req, 'race-h' + n]),
      as(her, 'select (offer_phone($1, true, $2)).status', [req, 'race-s' + n]),
    ]);
    check('7r. both offers accepted by the server', !a.error && !b.error, tag + JSON.stringify([a, b]));
    const sh = sees(await view(him, herP)), ss = sees(await view(her, hisP));
    check('8r. both offered at once: each sees the other\'s number without an extra tap', sh.number && ss.number, `${tag} him=${sh.number} her=${ss.number}`);
  }

  // A stranger never sees her photo or anyone's number.
  s = sees(await view(STRANGER, herP));
  check('15. stranger: no photo, no number of her', !s.photo && !s.number, tag);
  s = sees(await view(STRANGER, hisP));
  check('16. stranger: no number of him', !s.number, tag);

  if (path !== 2) {
    await as(her, 'select set_consent($1, false, false, false)', [req]);
    s = sees(await view(him, herP));
    check('17. she turns photo sharing off: his view loses the photo', !s.photo, tag);
  }
  // She blocks him: he can no longer open her profile, and she can't see his number either.
  await as(her, 'insert into blocks (user_id, blocked_profile_id) values ($1, $2)', [her, hisP]);
  const vb = await view(him, herP);
  check('18. after block: he cannot open her profile', !!vb.error, tag);
  const vh = await view(her, hisP);
  check('19. after block: she cannot open his profile either', !!vh.error, tag);
  const leak = await as(him, 'select get_requests(null) r');
  const txt = JSON.stringify(leak);
  check('20. after block: her number is not in his inbox data', !txt.includes('77' + String(2001 + n).padStart(8, '0')), tag);
}

const t0 = Date.now();
await Promise.all(Array.from({ length: 100 }, (_, n) => couple(n)));
console.log(`100 couples in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const names = [...new Set([...passes.keys(), ...fails.keys()])].sort((a, b) => parseFloat(a) - parseFloat(b));
for (const k of names) console.log((fails.has(k) ? 'FAIL ' : 'ok   ') + k.padEnd(84) + ` passed ${passes.get(k) || 0}` + (fails.has(k) ? `, failed ${fails.get(k).length} e.g. ${fails.get(k)[0]}` : ''));
await pool.end();
