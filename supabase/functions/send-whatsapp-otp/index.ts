// Supabase Edge Function: send-whatsapp-otp (Deno). Wired as Auth → Hooks → "Send SMS hook" (HTTPS),
// so every login code Supabase generates is delivered on WhatsApp through Waplify instead of SMS.
// verify_jwt = false: Supabase Auth calls it with a Standard Webhooks signature, checked below.
// Secrets: SEND_SMS_HOOK_SECRET ("v1,whsec_..." shown when the hook is created), WAPLIFY_API_KEY,
// WAPLIFY_TEMPLATE_NAME (the approved Authentication template), WAPLIFY_CODE_KEYS (body_data keys that
// receive the code, comma-separated; default "1"), optional WAPLIFY_BASE_URL.
import { sendOtp, verifyHook } from './send.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const body = await req.text();
  if (!(await verifyHook(env('SEND_SMS_HOOK_SECRET'), req.headers, body, Math.floor(Date.now() / 1000)))) {
    return Response.json({ error: { http_code: 401, message: 'Invalid signature' } }, { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  const r = await sendOtp(
    {
      apiKey: env('WAPLIFY_API_KEY'),
      templateName: env('WAPLIFY_TEMPLATE_NAME'),
      codeKeys: (env('WAPLIFY_CODE_KEYS') || '1').split(',').map((s) => s.trim()).filter(Boolean),
      baseUrl: env('WAPLIFY_BASE_URL') || undefined,
    },
    { fetch: (url, init) => fetch(url, init), log: (m) => console.log(m) },
    payload,
  );
  return Response.json(r.body, { status: r.status });
});
