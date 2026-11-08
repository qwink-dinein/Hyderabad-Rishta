/**
 * Design tokens — single source of truth for the visual system (see design.md, Design PRD v1.0 §2).
 * Never hardcode colours or spacing in screens; import from here.
 */
/**
 * Palette: Royal Burgundy × Champagne Gold × Warm Ivory (owner, premium redesign 2026-11-08).
 * Token NAMES are kept from the first palette so every screen recolours from here; read them as roles:
 * `emerald` = deep burgundy (brand, headings, maroon fills), `forest` = royal maroon (dark screens),
 * `ivory` = warm ivory (light screens), `gold` = royal gold (primary actions — never text on light).
 * Contrast (WCAG): espresso on ivory 14.2, burgundy on ivory 12.5, burgundy on gold 8.4, cream on maroon 16.4,
 * beige on maroon 10.3, champagne on maroon 14.3, goldDeep on ivory 5.5. Antique gold on ivory is 4.1:
 * borders, dividers and icons only, never small text.
 */
export const colors = {
  emerald: '#5E4A6E', // Mauve Violet — headings, nav highlights, maroon buttons and cards
  emeraldSoft: '#76627B', // raised mauve (panels on maroon)
  forest: '#3F2F48', // Deep Violet — dark screens (welcome, hero), premium sections
  ivory: '#F4EEE8', // Cream — light screens
  gold: '#D8C49A', // Soft Champagne — primary actions, Boosted, icons on dark (never text on light)
  goldMuted: '#A88446', // pressed gold; large icons on light
  goldDeep: '#7A5A36', // gold-toned SMALL text on ivory (AA 5.5:1)
  goldSoft: '#EFE4D2', // champagne-tinted surface on light (badges, selected chips)
  champagne: '#F1E6F0', // Soft violet-white — headings and highlights on dark
  cream: '#F7F2F6', // Soft Cream — main text on dark
  beige: '#CDBCCB', // Muted Lilac — supporting text on dark
  borderGold: '#B8A4B3', // Lilac Outline — outlines and dividers (on dark, and accents on light)
  sage: '#EAE1EA', // lilac surface — secondary cards, icon backgrounds; soft text on maroon
  white: '#FFFCF8', // warm card / input surface (instead of pure white)
  charcoal: '#3A2C40', // Deep Plum Text — body text on light
  muted: '#6B5D70', // secondary text on light (5.8:1 on ivory)
  border: '#E4D9E0', // hairlines on light surfaces
  danger: '#B65345', // Error terracotta — borders, icons, destructive buttons
  dangerText: '#9A4335', // terracotta for small text on tinted backgrounds (AA)
  dangerBg: '#F8E6E1',
  success: '#1E6B52', // Emerald — only "yes": accepted, sent, success (6.0:1 on ivory)
  successBg: '#E6F1EC',
  warningBg: '#F6EDD8',
  overlay: 'rgba(63, 47, 72, 0.58)',
  skeleton: '#ECE3EA',
} as const;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#3F2F48',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  soft: {
    shadowColor: '#3F2F48',
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
