// Push dispatcher core — runtime-agnostic (Deno in production, Node/Jest in tests).
// Claims due outbox rows, renders lock-screen-safe text, sends to Expo in chunks of 100,
// records each ticket, then checks receipts for messages sent >15 min ago.
import { pushContent } from '../_shared/push.ts';

export const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export interface ClaimedRow {
  id: number;
  token: string;
  type: string;
  params: Record<string, string> | null;
  deep_link: string | null;
  notification_id: string;
  lang: string | null;
  show_names: boolean | null;
}

export interface Deps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
  /** Optional Expo access token (enhanced push security). */
  accessToken?: string;
  batchSize?: number;
}

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

export function buildMessage(r: ClaimedRow) {
  const lang = r.lang === 'ur' || r.lang === 'te' ? r.lang : 'en';
  const { title, body } = pushContent({ type: r.type, params: r.params ?? {} }, lang, !!r.show_names);
  return {
    to: r.token,
    title,
    body,
    // Only routing data — never names, numbers or message text in the payload.
    data: { notificationId: r.notification_id, deepLink: r.deep_link ?? undefined },
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  };
}

function headers(d: Deps) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' };
  if (d.accessToken) h.Authorization = `Bearer ${d.accessToken}`;
  return h;
}

export async function dispatchOnce(d: Deps) {
  const rows = ((await d.rpc('claim_push_batch', { p_limit: d.batchSize ?? 500 })) as ClaimedRow[]) ?? [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    let tickets: Ticket[] | null = null;
    try {
      const res = await d.fetch(EXPO_SEND_URL, { method: 'POST', headers: headers(d), body: JSON.stringify(chunk.map(buildMessage)) });
      const json = await res.json().catch(() => null);
      if (res.ok && Array.isArray(json?.data) && json.data.length === chunk.length) tickets = json.data as Ticket[];
    } catch {
      tickets = null;
    }
    for (let j = 0; j < chunk.length; j++) {
      const t = tickets?.[j];
      if (!t) {
        failed++;
        await d.rpc('push_result', { p_id: chunk[j].id, p_ok: false, p_ticket: null, p_error: 'network' }); // retried with backoff
      } else if (t.status === 'ok') {
        sent++;
        await d.rpc('push_result', { p_id: chunk[j].id, p_ok: true, p_ticket: t.id, p_error: null });
      } else {
        failed++;
        await d.rpc('push_result', { p_id: chunk[j].id, p_ok: false, p_ticket: null, p_error: t.details?.error ?? 'ExpoError' });
      }
    }
  }
  return { claimed: rows.length, sent, failed };
}

export async function checkReceipts(d: Deps) {
  const ids = ((await d.rpc('due_push_receipts', { p_limit: 1000 })) as string[]) ?? [];
  if (!ids.length) return { checked: 0 };
  const res = await d.fetch(EXPO_RECEIPTS_URL, { method: 'POST', headers: headers(d), body: JSON.stringify({ ids }) });
  const json = await res.json().catch(() => null);
  const receipts: Record<string, { status: 'ok' | 'error'; details?: { error?: string } }> = json?.data ?? {};
  for (const [ticket, r] of Object.entries(receipts)) {
    await d.rpc('push_receipt', { p_ticket: ticket, p_ok: r.status === 'ok', p_error: r.status === 'ok' ? null : r.details?.error ?? 'ExpoError' });
  }
  return { checked: Object.keys(receipts).length };
}
