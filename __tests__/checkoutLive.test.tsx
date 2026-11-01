import { fireEvent, render, screen } from '@testing-library/react-native';
import { CheckoutSheet } from '@/components/Checkout';
import type { Order } from '@/domain/types';

/**
 * Owner report 2026-11-01 (real Android build): on a paid boost, "Simulate successful payment" did nothing.
 * The live app has no payment gateway yet, so the server refuses simulated payments. The live sheet now says
 * so plainly, with a working Close button, and never shows simulate buttons.
 */
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false }, Link: () => null }));
const mockKind = { kind: 'supabase' as 'supabase' | 'demo' };
jest.mock('@/services', () => ({
  get backendInfo() {
    return { kind: mockKind.kind };
  },
  backend: { completePayment: jest.fn() },
}));

const order: Order = {
  id: 'o1', userId: 'u', profileId: 'p', kind: 'boost', amount: 100, currency: 'INR', status: 'pending',
  terms: { autoRenew: false, boostDays: 7 } as Order['terms'], simulated: false, createdAt: '2026-11-01T00:00:00Z',
};

describe('checkout sheet', () => {
  it('live app: no simulate buttons; explains payments are not open yet; Close works', async () => {
    mockKind.kind = 'supabase';
    const onClose = jest.fn();
    await render(<CheckoutSheet order={order} onClose={onClose} onDone={jest.fn()} />);
    const r = screen;
    expect(r.queryByTestId('checkout-pay')).toBeNull();
    expect(r.getByTestId('checkout-soon')).toBeTruthy();
    await fireEvent.press(r.getByTestId('checkout-ok'));
    expect(onClose).toHaveBeenCalled();
  });
  it('demo: the simulate buttons are there for testing', async () => {
    mockKind.kind = 'demo';
    await render(<CheckoutSheet order={order} onClose={jest.fn()} onDone={jest.fn()} />);
    const r = screen;
    expect(r.getByTestId('checkout-pay')).toBeTruthy();
    expect(r.queryByTestId('checkout-soon')).toBeNull();
  });
});
