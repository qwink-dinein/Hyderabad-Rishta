// Checks store listing text against Google Play / App Store limits and listing rules.
import { LIMITS, LISTINGS } from './listings.mjs';
const errors = [];
const BANNED = /\b(best|#1|number one|top|free download|verified|guaranteed|shaadi\.com|jeevansathi|bharatmatrimony|nikahforever|muzz)\b/i;
for (const [loc, l] of Object.entries(LISTINGS)) {
  for (const [store, fields] of Object.entries(l)) {
    for (const [k, v] of Object.entries(fields)) {
      const n = [...v].length;
      const max = LIMITS[store][k];
      console.log(`${loc} ${store}.${k}: ${n}/${max}`);
      if (n > max) errors.push(`${loc} ${store}.${k} is ${n} chars (max ${max})`);
      if (k !== 'full' && BANNED.test(v)) errors.push(`${loc} ${store}.${k} uses a banned / misleading term`);
      if (k === 'full' && /\b(best|#1|number one|100% verified)\b/i.test(v)) errors.push(`${loc} full description makes a ranking/verification claim`);
    }
  }
}
for (const e of errors) console.log('ERROR:', e);
console.log(errors.length ? 'STORE LISTING CHECK FAILED' : 'STORE LISTING CHECK PASSED');
process.exit(errors.length ? 1 : 0);
