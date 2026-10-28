/**
 * Design tokens — single source of truth for the visual system (see design.md).
 * Never hardcode colours or spacing in screens; import from here.
 */
export const colors = {
  emerald: '#123D32',
  emeraldSoft: '#1D5546',
  ivory: '#F8F4EB',
  gold: '#C6A66B',
  goldDeep: '#8F7340', // AA-contrast gold for text on ivory/white
  sage: '#E6EEE7',
  white: '#FFFFFF',
  charcoal: '#24342D',
  muted: '#5C6B64', // secondary text, 5.6:1 on ivory
  border: '#DCD5C3',
  danger: '#A63A2B',
  dangerBg: '#F7E4E0',
  success: '#2E6B4F',
  successBg: '#E1EFE6',
  warningBg: '#F6EDD8',
  overlay: 'rgba(18, 61, 50, 0.55)',
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 18, xl: 28, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#123D32',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

/** Max content width so the web build reads well on desktop. */
export const maxContentWidth = 720;
