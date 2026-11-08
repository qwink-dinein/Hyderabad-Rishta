// Hyderabad Rishta public website: one place for brand facts, URLs and crawler policy.
// Everything published comes from here or from website/content, so the brand reads the same on every
// page, in structured data, in llms.txt and in the store listings (see ASO_STRATEGY.md).
//
// Production builds MUST set SITE_URL (and APP_URL once the web app is hosted). Without SITE_URL the
// build is treated as a preview: every page gets `noindex` and robots.txt blocks everything, so a
// staging copy can never be indexed by mistake.

const env = (k) => (process.env[k] || '').trim().replace(/\/+$/, '');

export const SITE_URL = env('SITE_URL'); // e.g. https://www.<your-domain>  (no trailing slash)
export const PRODUCTION = !!SITE_URL;
export const BASE = SITE_URL || 'http://localhost:4173';

// Where "Create your biodata" / "Log in" go. Recommended: the web app on its own subdomain
// (https://app.<your-domain>), which is private and never indexed (see public/robots.txt).
export const APP_URL = env('APP_URL');
// Store pages: only shown once the listings are live. Never link to a store page that does not exist.
export const PLAY_URL = env('PLAY_URL'); // https://play.google.com/store/apps/details?id=...
export const APP_STORE_URL = env('APP_STORE_URL');
// Direct Android download (APK) until the Play listing is live (owner 2026-11-08). Points at the latest EAS
// "preview" build; change it after each new build (or set the ANDROID_APK_URL build variable). Ignored once
// PLAY_URL is set — the Google Play badge then takes its place.
export const ANDROID_APK_URL = env('ANDROID_APK_URL') || 'https://expo.dev/artifacts/eas/rKEvqRs2nmGx4kv34FkMU0pjKogU7IU51Uj_yiOSj_Q.apk';

// Optional, privacy-friendly analytics (no cookies): Cloudflare Web Analytics token. Leave empty to
// ship no tracking at all. Search Console / Bing verification tokens go in the meta tags below.
export const CF_ANALYTICS_TOKEN = env('CF_ANALYTICS_TOKEN');
export const GOOGLE_SITE_VERIFICATION = env('GOOGLE_SITE_VERIFICATION');
export const BING_SITE_VERIFICATION = env('BING_SITE_VERIFICATION');

export const BRAND = {
  name: 'Hyderabad Rishta',
  // The one brand description used everywhere (GEO entity consistency).
  description:
    'Hyderabad Rishta is a Muslim matrimonial platform focused on helping individuals and families discover marriage profiles and meaningful rishta connections, starting with Hyderabad, India.',
  tagline: 'Muslim Matrimony & Marriage Profiles in Hyderabad',
  logo: '/img/logo-512.jpg',
  ogImage: '/img/og-default.jpg',
  languages: ['English', 'Urdu', 'Telugu'],
  area: 'Hyderabad, Telangana, India',
  // Same address the app's privacy policy and help page publish (src/app/legal/[doc].tsx).
  email: env('CONTACT_EMAIL') || 'mukarramjahmm@gmail.com',
  // Official social profiles, once they exist (used in Organization.sameAs). Never list unofficial pages.
  // Official profiles (owner 2026-11-08). SAME_AS (comma-separated) adds more.
  instagram: 'https://www.instagram.com/hyderabadrishta.official/',
  // A WhatsApp CHANNEL (one-way; followers' numbers stay hidden) — never a group invite, where members see each
  // other's numbers.
  whatsapp: 'https://whatsapp.com/channel/0029Vb8z9deIt5s0VKAKDZ0t',
  sameAs: ['https://www.instagram.com/hyderabadrishta.official/', 'https://whatsapp.com/channel/0029Vb8z9deIt5s0VKAKDZ0t', ...(process.env.SAME_AS || '').split(',').map((s) => s.trim()).filter(Boolean)],
};

// Facts the copy may state. Keep in sync with the product; the content never claims more than this.
export const FACTS = {
  // Publishing a biodata is currently free (admin pricing, checked 2026-11-02). If that changes, set
  // PUBLICATION_FREE=0 and rebuild: every "free" line disappears.
  publicationFree: process.env.PUBLICATION_FREE !== '0',
  // Profiles are NOT identity-verified, and admin approval is currently off. Never claim otherwise.
  verifiedProfiles: false,
};

// Crawler policy (owner decision pending — documented in GEO_STRATEGY.md). Default: search engines
// and AI *search/answer* crawlers may read the public marketing pages; bulk-training-only scrapers are
// asked to stay out. Private app paths are never crawlable by anyone (they live on the app subdomain,
// which serves its own robots.txt that blocks everything).
export const CRAWLERS = {
  allow: ['Googlebot', 'Bingbot', 'DuckDuckBot', 'Applebot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User'],
  // AI model-training crawlers. Allowed by default so the brand can be known to AI assistants; set
  // AI_TRAINING=0 to opt out (adds Disallow: / for each).
  training: ['GPTBot', 'Google-Extended', 'ClaudeBot', 'Applebot-Extended', 'meta-externalagent'],
  allowTraining: process.env.AI_TRAINING !== '0',
  // Generic bulk scrapers: blocked.
  block: ['CCBot', 'Bytespider', 'Amazonbot', 'Diffbot', 'omgili', 'ImagesiftBot'],
};
