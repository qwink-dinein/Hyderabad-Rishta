// Writes website/content/pages/{privacy,terms}.md from src/content/legal.ts (the in-app source),
// so the website and the app always show the same policy.  Run: npm run legal:md
import { readFileSync, writeFileSync } from 'node:fs';
const { PRIVACY, TERMS, LEGAL_UPDATED, CONTACT_EMAIL } = await import('../src/content/legal.ts');

export function toMarkdown(sections) {
  return sections.map(([h, body]) => {
    const text = body.replaceAll(CONTACT_EMAIL, '{{EMAIL}}').split('\n').map((l) => (l.startsWith('• ') ? '- ' + l.slice(2) : l)).join('\n');
    return `## ${h}\n\n${text}`;
  }).join('\n\n') + '\n';
}
const iso = new Date(LEGAL_UPDATED + ' UTC').toISOString().slice(0, 10);
const pages = {
  privacy: { sections: PRIVACY, title: 'Privacy Policy | Hyderabad Rishta', h1: 'Privacy policy', crumb: 'Privacy',
    description: 'How Hyderabad Rishta collects, uses and protects your data: who sees your biodata, consent-only photo and number sharing, retention and your rights.',
    lead: `Your biodata is personal. This policy explains what we collect, who can see it, how long we keep it and what you control. It is the same policy shown inside the app. Last updated ${LEGAL_UPDATED}.` },
  terms: { sections: TERMS, title: 'Terms of Use | Hyderabad Rishta', h1: 'Terms of use', crumb: 'Terms',
    description: 'The rules for using Hyderabad Rishta: eligibility, family-created biodatas, honest and respectful use, safety, Boost and payments, and disputes.',
    lead: `The short version: be honest, be respectful, involve your family, and never ask anyone for money. Last updated ${LEGAL_UPDATED}.` },
};
for (const [slug, p] of Object.entries(pages)) {
  const front = `---\nslug: ${slug}\ntitle: ${p.title}\ndescription: ${p.description}\nh1: ${p.h1}\nlead: ${p.lead}\ncrumb: ${p.crumb}\nupdated: ${iso}\n---\n`;
  const file = `website/content/pages/${slug}.md`;
  const next = front + toMarkdown(p.sections);
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== next) { console.error(`${file} is out of date: run npm run legal:md`); process.exit(1); }
  } else writeFileSync(file, next);
}
console.log(process.argv.includes('--check') ? 'legal pages match the app' : 'legal pages written');
