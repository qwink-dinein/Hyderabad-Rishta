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
  emerald: '#5A0B1D', // Deep Burgundy — headings, nav highlights, maroon buttons and cards
  emeraldSoft: '#6B1428', // raised burgundy (panels on maroon)
  forest: '#3A0012', // Royal Maroon — dark screens (welcome, hero), premium sections
  ivory: '#F7F1E7', // Warm Ivory — light screens
  gold: '#D4AF37', // Royal Gold — primary actions, Boosted, icons on dark (never text on light)
  goldMuted: '#A8882F', // pressed gold; large icons on light
  goldDeep: '#7A5C27', // gold-toned SMALL text on ivory (AA 5.5:1)
  goldSoft: '#F4E8CC', // champagne-tinted surface on light (badges, selected chips)
  champagne: '#F8E6B7', // Champagne Gold — headings and highlights on dark
  cream: '#F9F6EF', // Soft Cream — main text on dark
  beige: '#D7C3A1', // Muted Beige — supporting text on dark
  borderGold: '#8F713B', // Antique Gold — outlines and dividers (on dark, and accents on light)
  sage: '#EFE5D6', // warm sand — secondary cards, icon backgrounds; soft text on maroon
  white: '#FFFCF6', // warm card / input surface (instead of pure white)
  charcoal: '#351923', // Rich Espresso — body text on light
  muted: '#6B5A5D', // secondary text on light (5.8:1 on ivory)
  border: '#E5D8C3', // hairlines on light surfaces
  danger: '#B65345', // Error terracotta — borders, icons, destructive buttons
  dangerText: '#9A4335', // terracotta for small text on tinted backgrounds (AA)
  dangerBg: '#F8E6E1',
  success: '#1E6B52', // Emerald — only "yes": accepted, sent, success (6.0:1 on ivory)
  successBg: '#E6F1EC',
  warningBg: '#F6EDD8',
  overlay: 'rgba(58, 0, 18, 0.58)',
  skeleton: '#ECE2D3',
} as const;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#3A0012',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  soft: {
    shadowColor: '#3A0012',
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
