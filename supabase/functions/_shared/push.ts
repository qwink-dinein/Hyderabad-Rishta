// GENERATED from src/domain/push.ts by scripts/sync-shared.js — do not edit here.
// Types inlined for Deno (the app imports them from src/domain/types.ts).
type Lang = 'en' | 'ur' | 'te';
type NotificationType = string;
type PushCategory = 'interests' | 'activity' | 'account' | 'announcements';
interface PushPrefs { enabled: boolean; interests: boolean; activity: boolean; announcements: boolean; showNames: boolean }
interface AppNotification { type: NotificationType; params: Record<string, string> }

/**
 * Push policy — shared by the demo backend, the Supabase dispatcher (edge function) and tests.
 * Pure TypeScript: no React Native imports, so Deno can import it too.
 *
 * Rules (owner request 2026-10-28: "push whenever someone does any action on their profile"):
 *  - Every in-app notification is a push candidate; the in-app inbox is always the source of truth.
 *  - Lock-screen text is generic by default (no names), never contains phone numbers or message text.
 *  - Category switches let people quiet whole groups; account & safety cannot be switched off in-app.
 *  - Anti-spam: per-user hourly cap (account/safety exempt); profile views are batched upstream.
 */
export const CATEGORY: Record<NotificationType, PushCategory> = {
  request_received: 'interests',
  request_accepted: 'interests',
  request_declined: 'interests',
  request_expired: 'interests',
  phone_offer_received: 'interests',
  phone_offer_accepted: 'interests',
  phone_offer_declined: 'interests',
  phone_offer_withdrawn: 'interests',
  poke: 'interests',
  contact_shared: 'interests',
  profile_viewed: 'activity',
  profile_shortlisted: 'activity',
  profile_approved: 'account',
  profile_rejected: 'account',
  profile_published: 'account',
  boost_started: 'account',
  boost_ending: 'account',
  boost_ended: 'account',
  // A promotional nudge, so it obeys the member's "announcements" switch and the hourly cap.
  boost_reminder: 'announcements',
  payment: 'account',
  safety: 'account',
  security: 'account',
  admin_alert: 'account',
  team_created: 'account',
  announcement: 'announcements',
};

export const DEFAULT_PUSH_PREFS: PushPrefs = { enabled: true, interests: true, activity: true, announcements: true, showNames: false };

export const PUSH_HOURLY_CAP = 12;
/** A profile owner gets at most one "people viewed your profile" notice per window. */
export const VIEW_NOTICE_WINDOW_MS = 6 * 3600 * 1000;

export function prefsOf(p?: Partial<PushPrefs>): PushPrefs {
  return { ...DEFAULT_PUSH_PREFS, ...(p ?? {}) };
}

/** Whether this notification may go to the user's phones (before device/rate checks). */
export function pushAllowed(type: NotificationType, prefs: PushPrefs): { ok: true } | { ok: false; reason: 'disabled' | 'category_off' } {
  const cat = CATEGORY[type];
  if (cat === 'account') return { ok: true }; // approvals, payments, safety, security always reach the phone
  if (!prefs.enabled) return { ok: false, reason: 'disabled' };
  if (!prefs[cat]) return { ok: false, reason: 'category_off' };
  return { ok: true };
}

export const isRateLimitExempt = (type: NotificationType) => CATEGORY[type] === 'account';

type Copy = { generic: string; named?: string };
const T: Record<Lang, { title: string; types: Partial<Record<NotificationType | 'request_received_offer' | 'payment_paid' | 'payment_failed' | 'profile_viewed_many', Copy>>; fallback: string }> = {
  en: {
    title: 'Hyderabad Rishta',
    fallback: 'You have a new update. Open the app to see it.',
    types: {
      request_received: { generic: 'You have received a new interest.', named: '{{name}} expressed interest in your profile.' },
      request_received_offer: { generic: 'New interest — they also offered to share their number.', named: '{{name}} expressed interest and offered to share their number.' },
      request_accepted: { generic: 'Your interest was accepted.', named: '{{name}} accepted your interest.' },
      request_declined: { generic: 'An update on an interest you sent.', named: '{{name}} responded to your interest.' },
      request_expired: { generic: 'An interest you sent has expired. You can send a new one.' },
      phone_offer_received: { generic: 'Someone offered to share their phone number.', named: '{{name}} offered to share their phone number.' },
      phone_offer_accepted: { generic: 'Your number offer was accepted.', named: '{{name}} accepted your number offer.' },
      phone_offer_declined: { generic: 'An update on your number offer.', named: '{{name}} responded to your number offer.' },
      phone_offer_withdrawn: { generic: 'A number offer was withdrawn.', named: '{{name}} withdrew their number offer.' },
      poke: { generic: 'Someone is waiting for your response. Reply whenever convenient.' },
      contact_shared: { generic: 'New details were shared with you.', named: '{{name}} shared details with you.' },
      profile_viewed: { generic: 'Someone viewed your profile.' },
      profile_viewed_many: { generic: '{{count}} people viewed your profile.' },
      profile_shortlisted: { generic: 'Someone shortlisted your profile.' },
      profile_approved: { generic: 'Your profile has been approved and is now live.' },
      profile_rejected: { generic: 'Your profile needs a few changes. Open the app for details.' },
      profile_published: { generic: 'Your profile is now published.' },
      boost_started: { generic: 'Your boost is active — your profile is now featured.' },
      boost_ending: { generic: 'Your boost ends within 24 hours.' },
      boost_ended: { generic: 'Your boost has ended. You can boost again anytime.' },
      boost_reminder: { generic: 'Get noticed sooner — boost your profile to the top of Discover.' },
      payment_paid: { generic: 'Payment confirmed.' },
      payment_failed: { generic: 'Payment failed — you were not charged.' },
      safety: { generic: 'A safety review changed your profile visibility.' },
      security: { generic: 'Security alert for the admin team. Open the app to review.' },
      admin_alert: { generic: 'New admin alert. Open the dashboard to review.' },
      announcement: { generic: 'New announcement from Hyderabad Rishta.' },
    },
  },
  ur: {
    title: 'حیدرآباد رشتہ',
    fallback: 'آپ کے لیے نئی اپڈیٹ ہے۔ دیکھنے کے لیے ایپ کھولیں۔',
    types: {
      request_received: { generic: 'آپ کو ایک نئی دلچسپی موصول ہوئی ہے۔', named: '{{name}} نے آپ کی پروفائل میں دلچسپی ظاہر کی۔' },
      request_received_offer: { generic: 'نئی دلچسپی — انہوں نے نمبر شیئر کرنے کی پیشکش بھی کی۔', named: '{{name}} نے دلچسپی ظاہر کی اور نمبر شیئر کرنے کی پیشکش کی۔' },
      request_accepted: { generic: 'آپ کی دلچسپی قبول کر لی گئی۔', named: '{{name}} نے آپ کی دلچسپی قبول کی۔' },
      request_declined: { generic: 'آپ کی بھیجی گئی دلچسپی پر اپڈیٹ۔', named: '{{name}} نے آپ کی دلچسپی کا جواب دیا۔' },
      request_expired: { generic: 'آپ کی بھیجی گئی دلچسپی کی مدت ختم ہو گئی۔ آپ نئی بھیج سکتے ہیں۔' },
      phone_offer_received: { generic: 'کسی نے اپنا فون نمبر شیئر کرنے کی پیشکش کی۔', named: '{{name}} نے اپنا فون نمبر شیئر کرنے کی پیشکش کی۔' },
      phone_offer_accepted: { generic: 'آپ کی نمبر کی پیشکش قبول ہو گئی۔', named: '{{name}} نے آپ کی نمبر کی پیشکش قبول کی۔' },
      phone_offer_declined: { generic: 'آپ کی نمبر کی پیشکش پر اپڈیٹ۔', named: '{{name}} نے آپ کی نمبر کی پیشکش کا جواب دیا۔' },
      phone_offer_withdrawn: { generic: 'نمبر کی ایک پیشکش واپس لے لی گئی۔', named: '{{name}} نے اپنی نمبر کی پیشکش واپس لے لی۔' },
      poke: { generic: 'کوئی آپ کے جواب کا منتظر ہے۔ سہولت سے جواب دیں۔' },
      contact_shared: { generic: 'آپ کے ساتھ نئی تفصیلات شیئر کی گئیں۔', named: '{{name}} نے آپ کے ساتھ تفصیلات شیئر کیں۔' },
      profile_viewed: { generic: 'کسی نے آپ کی پروفائل دیکھی۔' },
      profile_viewed_many: { generic: '{{count}} لوگوں نے آپ کی پروفائل دیکھی۔' },
      profile_shortlisted: { generic: 'کسی نے آپ کی پروفائل پسندیدہ میں شامل کی۔' },
      profile_approved: { generic: 'آپ کی پروفائل منظور ہو گئی اور اب لائیو ہے۔' },
      profile_rejected: { generic: 'آپ کی پروفائل میں چند تبدیلیاں درکار ہیں۔ تفصیل ایپ میں دیکھیں۔' },
      profile_published: { generic: 'آپ کی پروفائل شائع ہو گئی ہے۔' },
      boost_started: { generic: 'آپ کا بوسٹ فعال ہے — آپ کی پروفائل نمایاں ہے۔' },
      boost_ending: { generic: 'آپ کا بوسٹ 24 گھنٹوں میں ختم ہو جائے گا۔' },
      boost_ended: { generic: 'آپ کا بوسٹ ختم ہو گیا۔ آپ کسی بھی وقت دوبارہ بوسٹ کر سکتے ہیں۔' },
      boost_reminder: { generic: 'جلد نظر میں آئیں — اپنی پروفائل کو بوسٹ کر کے ڈسکور میں سب سے اوپر لائیں۔' },
      payment_paid: { generic: 'ادائیگی کی تصدیق ہو گئی۔' },
      payment_failed: { generic: 'ادائیگی ناکام — آپ سے رقم نہیں لی گئی۔' },
      safety: { generic: 'حفاظتی جائزے سے آپ کی پروفائل کی مرئیت بدل گئی۔' },
      security: { generic: 'ایڈمن ٹیم کے لیے سیکیورٹی الرٹ۔ جائزے کے لیے ایپ کھولیں۔' },
      admin_alert: { generic: 'نیا ایڈمن الرٹ۔ جائزے کے لیے ڈیش بورڈ کھولیں۔' },
      announcement: { generic: 'حیدرآباد رشتہ کی جانب سے نیا اعلان۔' },
    },
  },
  te: {
    title: 'హైదరాబాద్ రిష్తా',
    fallback: 'మీకు కొత్త అప్‌డేట్ ఉంది. చూడటానికి యాప్ తెరవండి.',
    types: {
      request_received: { generic: 'మీకు కొత్త ఆసక్తి వచ్చింది.', named: '{{name}} మీ ప్రొఫైల్‌పై ఆసక్తి చూపారు.' },
      request_received_offer: { generic: 'కొత్త ఆసక్తి — వారు తమ నంబర్ షేర్ చేయడానికి కూడా ముందుకొచ్చారు.', named: '{{name}} ఆసక్తి చూపి, తమ నంబర్ షేర్ చేయడానికి ముందుకొచ్చారు.' },
      request_accepted: { generic: 'మీ ఆసక్తి అంగీకరించబడింది.', named: '{{name}} మీ ఆసక్తిని అంగీకరించారు.' },
      request_declined: { generic: 'మీరు పంపిన ఆసక్తిపై అప్‌డేట్.', named: '{{name}} మీ ఆసక్తికి స్పందించారు.' },
      request_expired: { generic: 'మీరు పంపిన ఆసక్తి గడువు ముగిసింది. కొత్తది పంపవచ్చు.' },
      phone_offer_received: { generic: 'ఎవరో తమ ఫోన్ నంబర్ షేర్ చేయడానికి ముందుకొచ్చారు.', named: '{{name}} తమ ఫోన్ నంబర్ షేర్ చేయడానికి ముందుకొచ్చారు.' },
      phone_offer_accepted: { generic: 'మీ నంబర్ ఆఫర్ అంగీకరించబడింది.', named: '{{name}} మీ నంబర్ ఆఫర్‌ను అంగీకరించారు.' },
      phone_offer_declined: { generic: 'మీ నంబర్ ఆఫర్‌పై అప్‌డేట్.', named: '{{name}} మీ నంబర్ ఆఫర్‌కు స్పందించారు.' },
      phone_offer_withdrawn: { generic: 'ఒక నంబర్ ఆఫర్ ఉపసంహరించబడింది.', named: '{{name}} తమ నంబర్ ఆఫర్‌ను ఉపసంహరించారు.' },
      poke: { generic: 'ఎవరో మీ స్పందన కోసం ఎదురుచూస్తున్నారు. వీలైనప్పుడు స్పందించండి.' },
      contact_shared: { generic: 'మీతో కొత్త వివరాలు షేర్ చేయబడ్డాయి.', named: '{{name}} మీతో వివరాలు షేర్ చేశారు.' },
      profile_viewed: { generic: 'ఎవరో మీ ప్రొఫైల్ చూశారు.' },
      profile_viewed_many: { generic: '{{count}} మంది మీ ప్రొఫైల్ చూశారు.' },
      profile_shortlisted: { generic: 'ఎవరో మీ ప్రొఫైల్‌ను షార్ట్‌లిస్ట్ చేశారు.' },
      profile_approved: { generic: 'మీ ప్రొఫైల్ ఆమోదించబడింది, ఇప్పుడు లైవ్‌లో ఉంది.' },
      profile_rejected: { generic: 'మీ ప్రొఫైల్‌లో కొన్ని మార్పులు అవసరం. వివరాలు యాప్‌లో చూడండి.' },
      profile_published: { generic: 'మీ ప్రొఫైల్ ప్రచురించబడింది.' },
      boost_started: { generic: 'మీ బూస్ట్ యాక్టివ్‌గా ఉంది — మీ ప్రొఫైల్ ప్రత్యేకంగా చూపబడుతోంది.' },
      boost_ending: { generic: 'మీ బూస్ట్ 24 గంటల్లో ముగుస్తుంది.' },
      boost_ended: { generic: 'మీ బూస్ట్ ముగిసింది. ఎప్పుడైనా మళ్ళీ బూస్ట్ చేయవచ్చు.' },
      boost_reminder: { generic: 'త్వరగా గుర్తింపు పొందండి — మీ ప్రొఫైల్‌ను బూస్ట్ చేసి డిస్కవర్‌లో పైన చూపించండి.' },
      payment_paid: { generic: 'చెల్లింపు నిర్ధారించబడింది.' },
      payment_failed: { generic: 'చెల్లింపు విఫలమైంది — మీ నుండి డబ్బు తీసుకోలేదు.' },
      safety: { generic: 'భద్రతా సమీక్ష వల్ల మీ ప్రొఫైల్ దృశ్యమానత మారింది.' },
      security: { generic: 'అడ్మిన్ బృందానికి భద్రతా హెచ్చరిక. సమీక్షించడానికి యాప్ తెరవండి.' },
      admin_alert: { generic: 'కొత్త అడ్మిన్ హెచ్చరిక. సమీక్షించడానికి డాష్‌బోర్డ్ తెరవండి.' },
      announcement: { generic: 'హైదరాబాద్ రిష్తా నుండి కొత్త ప్రకటన.' },
    },
  },
};

export const PUSH_LANGS = Object.keys(T) as Lang[];
export const pushCopyKeys = (lang: Lang) => Object.keys(T[lang].types).sort();

/** Strips anything that looks like a phone number or email — defence in depth for lock screens. */
export function scrubContact(s: string) {
  return s.replace(/\+?\d[\d\s-]{6,}\d/g, '•••').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '•••');
}

/** Lock-screen-safe title/body. Names only when the person opted in; never numbers or free text. */
export function pushContent(n: Pick<AppNotification, 'type' | 'params'>, lang: Lang, showNames: boolean): { title: string; body: string } {
  const pack = T[lang] ?? T.en;
  const key =
    n.type === 'payment'
      ? n.params.status === 'paid'
        ? 'payment_paid'
        : 'payment_failed'
      : n.type === 'request_received' && n.params.offered
        ? 'request_received_offer'
        : n.type === 'profile_viewed' && Number(n.params.count) > 1
          ? 'profile_viewed_many'
          : n.type;
  const copy = pack.types[key as keyof typeof pack.types] ?? T.en.types[key as keyof typeof pack.types];
  const name = (n.params.name ?? '').trim().slice(0, 40);
  const tpl = copy ? (showNames && copy.named && name ? copy.named : copy.generic) : pack.fallback;
  const body = tpl.replace('{{name}}', name).replace('{{count}}', String(Number(n.params.count) || 1));
  return { title: pack.title, body: scrubContact(body) };
}
