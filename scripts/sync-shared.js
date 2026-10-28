// Copies pure domain modules that Supabase Edge Functions (Deno) also need into supabase/functions/_shared.
// Usage: node scripts/sync-shared.js        (a Jest test fails if the copies drift from src/)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = [
  ['src/domain/push.ts', 'supabase/functions/_shared/push.ts'],
  ['src/domain/phone.ts', 'supabase/functions/_shared/phone.ts'],
];
const TYPES = `// Types inlined for Deno (the app imports them from src/domain/types.ts).
type Lang = 'en' | 'ur' | 'te';
type NotificationType = string;
type PushCategory = 'interests' | 'activity' | 'account' | 'announcements';
interface PushPrefs { enabled: boolean; interests: boolean; activity: boolean; announcements: boolean; showNames: boolean }
interface AppNotification { type: NotificationType; params: Record<string, string> }`;

function build(src) {
  const body = fs.readFileSync(path.join(root, src), 'utf8').replace(/^import type \{[^}]+\} from '\.\/types';\n/m, `${TYPES}\n`);
  return `// GENERATED from ${src} by scripts/sync-shared.js — do not edit here.\n${body}`;
}

if (require.main === module) {
  for (const [src, dest] of FILES) fs.writeFileSync(path.join(root, dest), build(src));
  console.log('synced', FILES.map((f) => f[1]).join(', '));
}
module.exports = { FILES, build };
