import { buildSeed, DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_SUBADMIN_PHONE } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata, PricingConfig } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS, type DemoDb } from '@/services/demo/demoBackend';
import { memoryKV, type KV } from '@/services/storage';

/**
 * Owner request 2026-10-29 ("build an expert team"): a simulated community on ONE shared server —
 * the master admin, a sub-admin, the seed members and newcomers — each on their own phone, doing
 * everything members do (register, publish, search, shortlist, express interest, accept/decline,
 * share numbers, boost and pay, pause, block, report, deactivate, delete) while the team moderates,
 * changes prices, adds members and deletes accounts. After EVERY action the whole database is checked
 * against the rules the app promises. Anything other than a clean result or an expected AppError is a bug.
 *
 * Deterministic (seeded); SIM_STEPS / SIM_SEEDS widen it: `SIM_STEPS=20000 SIM_SEEDS=5 npx jest simulation`.
 */
const STEPS = Number(process.env.SIM_STEPS ?? 400);
const SEEDS = (process.env.SIM_SEEDS ?? '1,2').split(',').map(Number).flatMap((n: number, _: number, a: number[]) => (a.length === 1 && n > 1 ? Array.from({ length: n }, (_, i) => i + 1) : [n]));
const PIN = '4719';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0), s / 2 ** 32);
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T,>(a: T[]) => a[Math.floor(next() * a.length)], chance: (p: number) => next() < p };
}

interface Persona {
  name: string;
  phone: string;
  /** This person's phone: their own secure storage (session token, trusted device, last number). */
  b: DemoBackend;
  kind: 'master' | 'admin' | 'member';
  lookingFor?: 'bride' | 'groom';
  gone?: boolean;
}

function biodataFor(lookingFor: 'bride' | 'groom', name: string): Biodata {
  const src = buildSeed().profiles.find((p) => p.biodata.basic.lookingFor === lookingFor && p.status === 'published')!.biodata;
  const b: Biodata = JSON.parse(JSON.stringify(src));
  b.basic.fullName = name;
  b.photos = [];
  return b;
}

async function simulate(seed: number) {
  const r = rng(seed);
  let clock = new Date('2026-10-01T09:00:00Z').getTime();
  const now = () => new Date(clock);
  const server = memoryKV();
  const phone = () => {
    const b = new DemoBackend({ storage: server, secure: memoryKV(), now });
    return b;
  };
  /** Every call re-reads the server copy, exactly like a phone talking to a shared database. */
  const fresh = (b: DemoBackend) => {
    const x = b as unknown as { db: unknown; loading: unknown };
    x.db = null;
    x.loading = null;
    return b;
  };
  const readDb = async (kv: KV) => JSON.parse((await kv.getItem('hr.demo.db'))!) as DemoDb;

  const seedDb = buildSeed();
  const people: Persona[] = [
    { name: 'Master', phone: DEMO_ADMIN_PHONE, b: phone(), kind: 'master' },
    { name: 'Sub-admin', phone: DEMO_SUBADMIN_PHONE, b: phone(), kind: 'admin' },
  ];
  for (const u of seedDb.users.filter((x) => x.role === 'user').slice(0, 14)) {
    const p = seedDb.profiles.find((x) => x.userId === u.id);
    people.push({ name: p?.biodata.basic.fullName ?? u.phone, phone: u.phone, b: phone(), kind: 'member', lookingFor: p?.biodata.basic.lookingFor });
  }
  let newcomerSeq = 0;
  const teamAdded: string[] = [];

  const stats = { ok: 0, expected: new Map<string, number>(), timings: new Map<string, number[]>() };
  const bugs: string[] = [];
  const log: string[] = [];
  const seen = new Set<string>();

  async function call<T>(who: Persona, op: string, fn: (b: DemoBackend) => Promise<T>): Promise<T | undefined> {
    const t0 = performance.now();
    try {
      const out = await fn(fresh(who.b));
      stats.ok++;
      return out;
    } catch (e) {
      if (e instanceof AppError) {
        const k = `${op}:${e.code}`;
        stats.expected.set(k, (stats.expected.get(k) ?? 0) + 1);
        return undefined;
      }
      bugs.push(`[seed ${seed}] ${who.name} ${op} crashed: ${(e as Error)?.stack ?? e}\n  recent: ${log.slice(-8).join(' | ')}`);
      return undefined;
    } finally {
      const ms = performance.now() - t0;
      (stats.timings.get(op) ?? stats.timings.set(op, []).get(op)!).push(ms);
    }
  }

  async function login(p: Persona) {
    clock += RESEND_COOLDOWN_MS + 1;
    if (r.chance(0.5)) {
      const viaPin = await call(p, 'pinLogin', (b) => b.pinLogin('+91', p.phone, PIN));
      if (viaPin) return true;
    }
    if (!(await call(p, 'requestOtp', (b) => b.requestOtp('+91', p.phone)))) return false;
    const v = await call(p, 'verifyOtp', (b) => b.verifyOtp('+91', p.phone, DEMO_OTP));
    if (!v) return false;
    if (v.needsPin) await call(p, 'setPin', (b) => b.setPin(PIN));
    return true;
  }
  const signedIn = async (p: Persona) => !!(await call(p, 'getSession', (b) => b.getSession())) || (await login(p));

  // ---------------- member behaviour ----------------
  const memberActions: [number, string, (p: Persona) => Promise<unknown>][] = [
    [10, 'browse', async (p) => {
      const page = await call(p, 'searchProfiles', (b) => b.searchProfiles({ ...EMPTY_FILTERS }, r.int(3), 10));
      const target = page && page.items.length ? r.pick(page.items) : undefined;
      if (target) await call(p, 'getProfile', (b) => b.getProfile(target.id));
      await call(p, 'getFeatured', (b) => b.getFeatured());
    }],
    [5, 'shortlist', async (p) => {
      const page = await call(p, 'searchProfiles', (b) => b.searchProfiles({ ...EMPTY_FILTERS }, 0, 20));
      if (page?.items.length) await call(p, 'toggleShortlist', (b) => b.toggleShortlist(r.pick(page.items).id));
      await call(p, 'getShortlist', (b) => b.getShortlist());
    }],
    [9, 'expressInterest', async (p) => {
      const page = await call(p, 'searchProfiles', (b) => b.searchProfiles({ ...EMPTY_FILTERS }, r.int(2), 20));
      if (!page?.items.length) return;
      const t = r.pick(page.items);
      const key = `k${r.int(1e9)}`;
      const offer = r.chance(0.3);
      const sent = await call(p, 'sendRequest', (b) => b.sendRequest(t.id, { message: r.chance(0.5) ? 'Assalamu alaikum, we liked the biodata.' : undefined, offerPhone: offer, consent: offer, idempotencyKey: key }));
      if (sent) {
        // Promise to members: the very next read shows "interest sent", and a double tap is the same request.
        const st = await call(p, 'getRequestStatusWith', (b) => b.getRequestStatusWith(t.id));
        if (!st || st.request.id !== sent.id) bugs.push(`[seed ${seed}] ${p.name}: interest to ${t.id} not visible right after sending`);
        const again = await call(p, 'sendRequest(retry)', (b) => b.sendRequest(t.id, { offerPhone: offer, consent: offer, idempotencyKey: key }));
        if (again && again.id !== sent.id) bugs.push(`[seed ${seed}] ${p.name}: retry with the same key created a second request`);
      }
    }],
    [9, 'answerRequests', async (p) => {
      const reqs = (await call(p, 'getRequests', (b) => b.getRequests())) ?? [];
      for (const v of reqs) {
        if (v.direction === 'received' && v.request.status === 'pending' && r.chance(0.6))
          await call(p, 'respondToRequest', (b) => b.respondToRequest(v.request.id, r.chance(0.7) ? 'accepted' : 'declined'));
        else if (v.direction === 'sent' && v.request.status === 'pending' && r.chance(0.1)) await call(p, 'withdrawRequest', (b) => b.withdrawRequest(v.request.id));
        else if (v.direction === 'sent' && v.request.status === 'pending' && r.chance(0.2)) await call(p, 'pokeRequest', (b) => b.pokeRequest(v.request.id));
        else if (v.request.status === 'accepted' && !v.myOffer && r.chance(0.4)) await call(p, 'offerPhone', (b) => b.offerPhone(v.request.id, true, `o${r.int(1e9)}`));
        else if (v.theirOffer?.status === 'offered' && r.chance(0.6))
          await call(p, 'respondToPhoneOffer', (b) => b.respondToPhoneOffer(v.theirOffer!.id, r.chance(0.8) ? 'accepted' : 'declined'));
        else if (v.request.status === 'accepted' && r.chance(0.2)) await call(p, 'setConsent', (b) => b.setConsent(v.request.id, { photos: true, phone: false, fullBiodata: r.chance(0.5) }));
      }
    }],
    [5, 'boost', async (p) => {
      const pricing = await call(p, 'getPricing', (b) => b.getPricing());
      const plan = pricing && r.chance(0.8) ? r.pick(pricing.boostPlans.filter((x) => x.enabled))?.id : undefined;
      const started = await call(p, 'startBoost', (b) => b.startBoost(plan));
      if (started?.order.status === 'pending') {
        if (r.chance(0.15)) return; // walks away from checkout; the order stays open
        await call(p, 'completePayment', (b) => b.completePayment(started.order.id, r.chance(0.85) ? 'success' : 'failure'));
      }
      await call(p, 'getDashboard', (b) => b.getDashboard());
      await call(p, 'getMyOrders', (b) => b.getMyOrders());
    }],
    [4, 'notifications', async (p) => {
      const ns = (await call(p, 'getNotifications', (b) => b.getNotifications())) ?? [];
      if (ns.length && r.chance(0.5)) await call(p, 'markNotificationRead', (b) => b.markNotificationRead(r.pick(ns).id));
      else if (r.chance(0.3)) await call(p, 'markAllNotificationsRead', (b) => b.markAllNotificationsRead());
    }],
    [3, 'editBiodata', async (p) => {
      const mine = await call(p, 'getMyProfile', (b) => b.getMyProfile());
      if (!mine) return;
      const bd: Biodata = JSON.parse(JSON.stringify(mine.biodata));
      bd.basic = { ...bd.basic, aboutMe: `Updated ${r.int(1000)} — a quiet, family-minded person.` };
      await call(p, 'saveDraft', (b) => b.saveDraft(bd, 7));
      if (mine.status === 'draft' || mine.status === 'rejected') await publish(p);
    }],
    [2, 'pauseResume', async (p) => call(p, 'setPaused', (b) => b.setPaused(r.chance(0.5)))],
    [2, 'blockOrReport', async (p) => {
      const page = await call(p, 'searchProfiles', (b) => b.searchProfiles({ ...EMPTY_FILTERS }, 0, 20));
      if (!page?.items.length) return;
      const t = r.pick(page.items);
      if (r.chance(0.5)) await call(p, 'reportProfile', (b) => b.reportProfile(t.id, 'fake', 'Looks like a fake profile'));
      else {
        await call(p, 'blockProfile', (b) => b.blockProfile(t.id));
        if (r.chance(0.3)) await call(p, 'unblockProfile', (b) => b.unblockProfile(t.id));
      }
    }],
    [2, 'logoutLogin', async (p) => {
      await call(p, 'logout', (b) => b.logout());
      await login(p);
    }],
    [0.6, 'deactivate', async (p) => {
      await call(p, 'deactivateAccount', (b) => b.deactivateAccount());
      if (r.chance(0.6)) await login(p); // logging back in undoes self-deactivation
    }],
    [0.4, 'deleteAccount', async (p) => {
      if (await call(p, 'deleteAccount', (b) => b.deleteAccount())) {
        // Deletion is immediate and permanent; the number may register afresh.
        if (r.chance(0.3)) await register(p);
        else p.gone = true;
      }
    }],
  ];

  async function publish(p: Persona) {
    const res = await call(p, 'submitForPublication', (b) => b.submitForPublication());
    if (res?.order) await call(p, 'completePayment', (b) => b.completePayment(res.order!.id, 'success'));
  }

  async function register(p: Persona) {
    if (!(await login(p))) return;
    const mine = await call(p, 'getMyProfile', (b) => b.getMyProfile());
    if (mine) return;
    await call(p, 'saveDraft', (b) => b.saveDraft(biodataFor(p.lookingFor!, p.name), r.chance(0.2) ? 3 : 7));
    if (r.chance(0.85)) await publish(p);
  }

  // ---------------- team behaviour ----------------
  const admins = people.filter((p) => p.kind !== 'member');
  const adminActions: [number, string, (a: Persona) => Promise<unknown>][] = [
    [5, 'moderate', async (a) => {
      const pending = (await call(a, 'adminListProfiles', (b) => b.adminListProfiles('pending'))) ?? [];
      for (const p of pending) await call(a, 'adminSetProfileStatus', (b) => b.adminSetProfileStatus(p.id, r.chance(0.85) ? 'published' : 'rejected', 'Please add your education details'));
      const reports = (await call(a, 'adminListReports', (b) => b.adminListReports())) ?? [];
      for (const rep of reports.filter((x) => x.status === 'open').slice(0, 3))
        await call(a, 'adminResolveReport', (b) => b.adminResolveReport(rep.id, r.chance(0.5) ? 'resolved' : 'dismissed', r.chance(0.3)));
    }],
    [2, 'pricing', async (a) => {
      const cfg = await call(a, 'getPricing', (b) => b.getPricing());
      if (!cfg) return;
      const next: PricingConfig = JSON.parse(JSON.stringify(cfg));
      const plan = r.pick(next.boostPlans);
      plan.fee.groom = { mode: 'paid', amount: r.pick([100, 150, 199, 250]) };
      plan.fee.bride = r.chance(0.5) ? { mode: 'free', amount: 0 } : { mode: 'paid', amount: r.pick([99, 200]) };
      if (r.chance(0.15)) plan.enabled = !plan.enabled;
      if (!next.boostPlans.some((x) => x.enabled)) plan.enabled = true;
      if (r.chance(0.2)) next.requireApproval = !next.requireApproval;
      await call(a, 'adminUpdatePricing', (b) => b.adminUpdatePricing(next));
    }],
    [2, 'addMember', async (a) => {
      const num = `98${String(seed).padStart(2, '0')}${String(++newcomerSeq).padStart(6, '0')}`;
      const lf = r.chance(0.5) ? 'groom' : 'bride';
      const created = await call(a, 'adminCreateMember', (b) => b.adminCreateMember({ countryCode: '+91', phone: num, biodata: biodataFor(lf, `Team Added ${newcomerSeq}`), lastStep: 7 }));
      if (!created) return;
      if (r.chance(0.8)) await call(a, 'adminPublishMember', (b) => b.adminPublishMember(created.profile.id));
      teamAdded.push(num);
      // Later the number's real owner turns up and logs in with OTP.
      people.push({ name: `Owner of ${num}`, phone: num, b: phone(), kind: 'member', lookingFor: lf });
    }],
    [1.5, 'suspendOrDelete', async (a) => {
      const users = ((await call(a, 'adminListUsers', (b) => b.adminListUsers())) ?? []).filter((u) => u.role === 'user' && !u.deletedAt);
      if (!users.length) return;
      const u = r.pick(users);
      if (r.chance(0.5)) await call(a, 'adminSetUserDeactivated', (b) => b.adminSetUserDeactivated(u.id, !u.deactivatedAt));
      else if (await call(a, 'adminDeleteUser', (b) => b.adminDeleteUser(u.id, 'Duplicate account'))) {
        if (a.kind === 'master' && r.chance(0.4)) await call(a, 'masterRestore', (b) => b.masterRestore('user', u.id));
      }
    }],
    [1, 'housekeeping', async (a) => {
      await call(a, 'adminStats', (b) => b.adminStats());
      await call(a, 'adminListOrders', (b) => b.adminListOrders());
      await call(a, 'adminAuditLog', (b) => b.adminAuditLog());
      const reqs = (await call(a, 'adminListRequests', (b) => b.adminListRequests())) ?? [];
      if (reqs.length && r.chance(0.2)) await call(a, 'adminDeleteRequest', (b) => b.adminDeleteRequest(r.pick(reqs).id));
    }],
  ];

  const pickWeighted = <T extends [number, string, unknown]>(list: T[]) => {
    let x = r.next() * list.reduce((s, a) => s + a[0], 0);
    for (const a of list) if ((x -= a[0]) <= 0) return a;
    return list[list.length - 1];
  };

  // Newcomers join over time.
  const addNewcomer = () => {
    const n = ++newcomerSeq;
    people.push({ name: `Newcomer ${n}`, phone: `97${String(seed).padStart(2, '0')}${String(n).padStart(6, '0')}`, b: phone(), kind: 'member', lookingFor: r.chance(0.5) ? 'bride' : 'groom' });
    return people[people.length - 1];
  };

  for (let step = 0; step < STEPS; step++) {
    clock += r.chance(0.03) ? r.int(3) * 86400000 + 3600000 : r.int(40) * 60000 + 1000;
    if (r.chance(0.04)) await register(addNewcomer());
    const actor = r.chance(0.12) ? r.pick(admins) : r.pick(people.filter((p) => p.kind === 'member' && !p.gone));
    if (!(await signedIn(actor))) {
      if (actor.kind === 'member' && !actor.gone) {
        // Removed or suspended by the team: they can't get back in; try again much later.
        log.push(`${actor.name} could not sign in`);
      }
      continue;
    }
    if (actor.kind === 'member' && !(await call(actor, 'getMyProfile', (b) => b.getMyProfile()))) {
      await register(actor);
      continue;
    }
    const [, label, act] = actor.kind === 'member' ? pickWeighted(memberActions) : pickWeighted(adminActions);
    log.push(`${step}:${actor.name}:${label}`);
    await act(actor);
    const problems = checkInvariants(await readDb(server), clock).filter((p) => !seen.has(p));
    for (const p of problems) seen.add(p);
    for (const p of problems) bugs.push(`[seed ${seed}] step ${step} after ${actor.name} ${label}: ${p}\n  recent: ${log.slice(-6).join(' | ')}`);
    if (bugs.length > 20) break;
    // Privacy promise: nobody's number ever appears in another member's search results.
    if (actor.kind === 'member' && r.chance(0.1)) {
      const page = await call(actor, 'searchProfiles', (b) => b.searchProfiles({ ...EMPTY_FILTERS }, 0, 50));
      const db = await readDb(server);
      const text = JSON.stringify(page ?? {});
      for (const u of db.users) if (u.phone !== actor.phone && text.includes(u.phone)) bugs.push(`[seed ${seed}] ${actor.name} saw ${u.phone} in search results`);
      const me = db.users.find((u) => u.phone === actor.phone);
      const mine = me && db.profiles.find((p) => p.userId === me.id && !p.deletedAt);
      for (const it of page?.items ?? []) {
        const p = db.profiles.find((x) => x.id === it.id);
        const owner = p && db.users.find((u) => u.id === p.userId);
        if (!p || p.status !== 'published' || p.deletedAt || !owner || owner.deletedAt || owner.deactivatedAt) bugs.push(`[seed ${seed}] ${actor.name} found a profile that is not live: ${it.id} (${p?.status})`);
        if (mine && p && p.biodata.basic.lookingFor === mine.biodata.basic.lookingFor) bugs.push(`[seed ${seed}] ${actor.name} was shown a same-side profile ${it.id}`);
        if (me && p && db.blocks.some((x) => (x.userId === me.id && x.blockedProfileId === p.id) || (x.userId === p.userId && x.blockedProfileId === mine?.id)))
          bugs.push(`[seed ${seed}] ${actor.name} was shown a blocked profile ${it.id}`);
      }
    }
  }
  const db = await readDb(server);
  return { stats, bugs, people: people.length, teamAdded: teamAdded.length, size: JSON.stringify(db).length, db };
}

/** The rules the app promises, checked over the whole database. Returns human-readable violations. */
function checkInvariants(db: DemoDb, clock: number): string[] {
  const out: string[] = [];
  const users = new Map(db.users.map((u) => [u.id, u]));
  const profiles = new Map(db.profiles.map((p) => [p.id, p]));
  // One number = one account.
  const nums = new Map<string, number>();
  for (const u of db.users) nums.set(`${u.countryCode}${u.phone}`, (nums.get(`${u.countryCode}${u.phone}`) ?? 0) + 1);
  for (const [n, c] of nums) if (c > 1) out.push(`number ${n} has ${c} accounts`);
  // One account = one biodata; every biodata has an owner.
  const per = new Map<string, number>();
  for (const p of db.profiles) {
    if (!users.has(p.userId)) out.push(`profile ${p.id} has no owner`);
    if (!p.deletedAt) per.set(p.userId, (per.get(p.userId) ?? 0) + 1);
  }
  for (const [u, c] of per) if (c > 1) out.push(`user ${u} has ${c} live biodatas`);
  const codes = new Set<string>();
  for (const p of db.profiles) {
    if (codes.has(p.code)) out.push(`profile code ${p.code} reused`);
    codes.add(p.code);
  }
  // Requests: real parties, never two open requests between the same pair.
  const open = new Set<string>();
  for (const q of db.requests) {
    if (!profiles.has(q.fromProfileId) || !profiles.has(q.toProfileId)) out.push(`request ${q.id} points at a missing profile`);
    if (!users.has(q.fromUserId) || !users.has(q.toUserId)) out.push(`request ${q.id} points at a missing user`);
    if (q.fromProfileId === q.toProfileId) out.push(`request ${q.id} is to self`);
    if (q.status === 'pending' || q.status === 'accepted') {
      const k = [q.fromProfileId, q.toProfileId].sort().join('|');
      if (open.has(k)) out.push(`two open requests between ${k}`);
      open.add(k);
    }
  }
  for (const o of db.phoneOffers) {
    const q = db.requests.find((x) => x.id === o.requestId);
    if (!q) out.push(`phone offer ${o.id} without its request`);
    else if (o.status === 'accepted' && q.status !== 'accepted') out.push(`number shared (${o.id}) on a ${q.status} request`);
  }
  // Money: one open boost order per profile; amounts honest; a running boost was paid for or free.
  const pendingBoost = new Map<string, number>();
  for (const o of db.orders) {
    if (o.amount < 0) out.push(`order ${o.id} has a negative amount`);
    if (o.status === 'free' && o.amount !== 0) out.push(`free order ${o.id} charged ${o.amount}`);
    if (o.status === 'paid' && o.amount <= 0) out.push(`paid order ${o.id} has amount ${o.amount}`);
    if (o.kind === 'boost' && o.status === 'pending') pendingBoost.set(o.profileId, (pendingBoost.get(o.profileId) ?? 0) + 1);
    if (o.kind === 'boost' && !o.terms.planId && o.createdAt > '2026-10-01') out.push(`boost order ${o.id} has no plan`);
    // Orders deliberately outlive erased members (financial record; SQL detaches them with ON DELETE SET NULL).
  }
  for (const [p, c] of pendingBoost) if (c > 1) out.push(`profile ${p} has ${c} open boost orders`);
  for (const p of db.profiles) {
    if (!p.boostUntil || new Date(p.boostUntil).getTime() <= clock || p.createdAt < '2026-10-01') continue;
    const backing = db.orders.find((o) => o.profileId === p.id && o.kind === 'boost' && (o.status === 'paid' || o.status === 'free'));
    if (!backing) out.push(`profile ${p.id} is boosted without a paid or free order`);
  }
  // Sessions and notifications only for real, active accounts.
  for (const s of db.sessions) {
    const u = users.get(s.userId);
    if (!s.revokedAt && (!u || u.deletedAt)) out.push(`live session for removed account ${s.userId}`);
  }
  for (const n of db.notifications) if (!users.has(n.userId)) out.push(`notification ${n.id} for a missing user`);
  for (const sl of db.shortlists) if (!profiles.has(sl.profileId)) out.push(`shortlist entry to a missing profile ${sl.profileId}`);
  return [...new Set(out)];
}

describe('expert team simulation', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: ${STEPS} steps of a busy community keep every promise`, async () => {
      const res = await simulate(seed);
      const timing = [...res.stats.timings].map(([op, t]) => {
        const s = [...t].sort((a, b) => a - b);
        return { op, n: s.length, p50: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] };
      });
      if (process.env.SIM_REPORT) {
        console.log(
          [
            `seed ${seed}: ${res.people} people, ${res.teamAdded} team-added, ${res.stats.ok} successful calls, db ${(res.size / 1024).toFixed(0)} KB`,
            `users ${res.db.users.length} profiles ${res.db.profiles.length} requests ${res.db.requests.length} orders ${res.db.orders.length} notifications ${res.db.notifications.length} audit ${res.db.audit.length} analytics ${res.db.analytics.length} views ${res.db.views.length}`,
            'refused (expected): ' + [...res.stats.expected].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', '),
            'slowest: ' + timing.sort((a, b) => b.p95 - a.p95).slice(0, 10).map((t) => `${t.op} p50 ${t.p50.toFixed(1)} p95 ${t.p95.toFixed(1)} max ${t.max.toFixed(0)}ms (n=${t.n})`).join('; '),
          ].join('\n'),
        );
      }
      expect(res.bugs).toEqual([]);
      expect(res.stats.ok).toBeGreaterThan(STEPS);
    }, 600_000);
  }
});
