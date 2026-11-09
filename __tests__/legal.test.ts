import { spawnSync } from 'node:child_process';
import { PRIVACY, TERMS, CONTACT_EMAIL } from '@/content/legal';

describe('privacy policy and terms', () => {
  it('website pages match the in-app text', () => {
    const r = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', 'scripts/legal-md.mjs', '--check'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('has no unfilled placeholders or draft wording', () => {
    const all = JSON.stringify([PRIVACY, TERMS]);
    expect(all).not.toMatch(/\[[A-Z ]{3,}|\bdraft\b|TODO|TBD/i);
  });

  it('states the promises the app keeps', () => {
    const p = PRIVACY.map(([h, b]) => `${h}\n${b}`).join('\n');
    expect(p).toContain('You choose who sees your mobile number');
    expect(p).toContain('stays private');
    expect(p).toContain('never sent to search engines');
  });

  it('publishes one contact address', () => {
    expect(CONTACT_EMAIL).toBe('mukarramjahmm@gmail.com');
  });
});
