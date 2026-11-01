import { AppError, isNetworkFailure } from '@/services/backend';
import { toAppError } from '@/services/supabase/map';

/** UX states (owner checklist 2026-11-01): connection failures are recognised and named, never "something went wrong". */
describe('network failures', () => {
  it.each(['TypeError: Network request failed', 'Failed to fetch', 'TypeError: fetch failed', 'NetworkError when attempting to fetch resource.', 'Load failed', 'request timed out'])(
    'recognises "%s"',
    (message) => {
      expect(isNetworkFailure(new Error(message))).toBe(true);
      expect(toAppError({ message }).code).toBe('network');
    },
  );
  it('does not mistake real server answers for connection problems', () => {
    expect(isNetworkFailure(new AppError('forbidden'))).toBe(false);
    expect(toAppError({ message: 'forbidden: not yours' }).code).toBe('forbidden');
    expect(toAppError({ message: 'boost_active', hint: 'x' }).code).toBe('boost_active');
    expect(toAppError({ status: 429, message: 'Too many requests' }).code).toBe('rate_limited');
    expect(isNetworkFailure(new AppError('network'))).toBe(true);
  });
});
