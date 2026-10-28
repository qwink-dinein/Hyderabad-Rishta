/**
 * Design tokens — single source of truth for the visual system (see design.md, Design PRD v1.0 §2).
 * Never hardcode colours or spacing in screens; import from here.
 */
export const colors = {
  emerald: '#123D32', // Deep Emerald — primary buttons, headings, nav highlights
  emeraldSoft: '#1D5546',
  forest: '#0B3028', // Dark Forest — hero overlays, premium dark sections
  ivory: '#F8F4EB', // Warm Ivory — app background
  gold: '#C6A66B', // Champagne Gold — decorative accents, selected highlights (never small text on light)
  goldMuted: '#A98543', // Muted Gold — icons and large text on light backgrounds (3.1:1)
  goldDeep: '#8A6A30', // gold-toned SMALL text on ivory/white (AA 4.6:1)
  goldSoft: '#F4EBD8', // gold-tinted surface (badges, selected chips)
  sage: '#E6EEE7', // Sage Mist — secondary cards, icon backgrounds
  white: '#FFFFFF', // Porcelain — inputs, cards, sheets
  charcoal: '#24342D', // body text
  muted: '#65736D', // Muted Grey — secondary text (4.5:1 on ivory)
  border: '#E2D7C1', // Border Beige
  danger: '#B65345', // Error Terracotta — borders, icons, destructive buttons
  dangerText: '#9A4335', // terracotta for small text on tinted backgrounds (AA)
  dangerBg: '#F8E6E1',
  success: '#267653', // Success Green
  successBg: '#E1EFE6',
  warningBg: '#F6EDD8',
  overlay: 'rgba(11, 48, 40, 0.55)',
  skeleton: '#EDE6D6',
} as const;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#123D32',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  soft: {
    shadowColor: '#123D32',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
} as const;

/** Motion timings (Design PRD §12.1), in ms. */
export const motion = { press: 120, heart: 210, fade: 220, sheet: 280, screen: 260, success: 340, carousel: 420, autoplay: 6000 } as const;

/** Max content width so the web build reads well on desktop. */
export const maxContentWidth = 720;
