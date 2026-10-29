# WhatsApp login codes (Waplify) — setup guide

Owner decision (2026-10-29): login codes go **only on WhatsApp**, through Waplify. Resend unlocks after
**60 seconds**. Numbers without WhatsApp cannot log in (the login screen says so after the first wait).

## How it works
1. The member types their number. The app asks Supabase Auth for a phone OTP.
2. Supabase generates a 6-digit code (valid 10 minutes, max one send per 60 s per number).
3. Instead of SMS, Supabase calls our Edge Function **`send-whatsapp-otp`** (Auth → Hooks → *Send SMS hook*),
   signed with the hook secret.
4. The function checks the signature, then calls Waplify:
   `POST https://server.waplify.io/api/v1/messages/send` with
   `{ template_name, contact_phone: "91XXXXXXXXXX", contact_name, body_data: { "1": "<code>" } }`.
5. The member types the code; Supabase verifies it. The app then continues exactly as today (PIN set-up etc.).

The Waplify key lives only in Supabase secrets — never in the app. The code and full number are never logged.

## Owner steps

### A. Waplify / WhatsApp
1. **WhatsApp number** — connected and active in Waplify, display name approved by Meta.
2. **Template** — Waplify → Templates → New:
   - Category **Authentication**, name **`hr_login_otp`**, language **English** (`en`)
   - Button **Copy code**; tick *security recommendation*; tick *expiry* = **10 minutes**
   - Submit and wait for approval.
3. **API key** — Developers → API → *Create API Key*. Copy it once; never paste it in chat or code.
4. **Check how the code fills the template** — in Waplify's API docs (Messages → send template), see how
   `body_data` carries variables for an Authentication template and whether the Copy-code button needs
   its own entry. Default here is `body_data: { "1": code }`; if the button needs one too, set
   `WAPLIFY_CODE_KEYS` (step B5) to both keys, e.g. `1,button_1` — no code change needed.

### B. Supabase
1. Create the project in the **Hyderabad-rishta-app** organization, region **Mumbai (ap-south-1)**.
2. Apply the migrations (`supabase link` then `supabase db push`).
3. Deploy the function: `supabase functions deploy send-whatsapp-otp --no-verify-jwt`.
4. Authentication → Hooks → **Send SMS hook** → HTTPS →
   `https://<project-ref>.supabase.co/functions/v1/send-whatsapp-otp` → *Generate secret* → save.
5. Edge Functions → Secrets:

   | Name | Value |
   |---|---|
   | `SEND_SMS_HOOK_SECRET` | the secret from B4 (`v1,whsec_…`) |
   | `WAPLIFY_API_KEY` | your `wapl_…` key |
   | `WAPLIFY_TEMPLATE_NAME` | `hr_login_otp` |
   | `WAPLIFY_CODE_KEYS` | `1` (or e.g. `1,button_1` — see A4) |

6. Authentication → Sign In / Providers → **Phone** → enable (no SMS provider needed — the hook replaces it).
   OTP length **6**, expiry **600 s**; Rate limits: about **5 codes / hour per number**.
   (`supabase/config.toml` holds the same values for `supabase config push`.)
7. **Reviewer number** — Authentication → Phone → *Test phone numbers*: `919000000001` = `123456`.
   Apple and Google reviewers cannot receive our WhatsApp; put this number + code in the store review notes.

### C. Test before launch
- Your own number: code arrives on WhatsApp within seconds; Copy code works; wrong code is refused.
- Resend is disabled for 60 s, then works; the 6th code within an hour is refused.
- A number without WhatsApp: no message arrives; after 60 s the screen shows the WhatsApp hint.
- Function logs show `waplify 4xx … req=<id> to=…1234` on failures — never the code.

## Known limits
- WhatsApp usually reports "not on WhatsApp" only later (delivery webhook), so the app cannot say it
  instantly; it shows the hint once Resend unlocks.
- Waplify allows 100 API requests per minute per key by default — far above expected login volume; a
  `429` is shown to the member as "try again in N seconds".

## Files
- `supabase/functions/send-whatsapp-otp/send.ts` (signature check, Waplify call, error mapping) and `index.ts`
- `__tests__/whatsappOtp.test.ts`
- `supabase/config.toml` (`[auth.sms]`, `[auth.sms.test_otp]`, `[auth.hook.send_sms]`)
- Login text in `src/i18n/{en,ur,te}.ts` (`auth.*`, `auth.whatsappHint`), `src/app/login.tsx`
