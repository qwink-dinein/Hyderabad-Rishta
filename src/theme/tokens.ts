/**
 * Design tokens — single source of truth for the visual system (see design.md, Design PRD v1.0 §2).
 * Never hardcode colours or spacing in screens; import from here.
 */
/**
 * Palette: Lac, Pearl & Antique Gold (owner decision 2026-11-01; docs/design/palette.md).
 * Token NAMES are kept from the first palette so every screen recolours from here; read them as roles:
 * `emerald` = lac maroon (brand, primary buttons, headings), `ivory` = pearl, `gold` = antique gold.
 */
export const colors = {
  emerald: '#4A0E1F', // Lac maroon — primary buttons, headings, nav highlights
  emeraldSoft: '#5A1628', // raised lac (panels on maroon)
  forest: '#330915', // deep lac — hero gradients, premium dark sections
  ivory: '#FAF6F1', // Pearl — app background
  gold: '#C9A05A', // Antique gold — the one main action on maroon, Boosted, emblem (never small text on light)
  goldMuted: '#9C7634', // pressed gold; icons and large text on light (3.9:1)
  goldDeep: '#7E5F26', // gold-toned SMALL text on pearl/white (AA 5.5:1)
  goldSoft: '#F6ECDD', // gold-tinted surface (badges, selected chips)
  sage: '#F4E9E5', // Rose mist — secondary cards, icon backgrounds; soft text on maroon
  white: '#FFFFFF', // cards, inputs, sheets
  charcoal: '#2A0B13', // Kohl ink — body text (16.9:1 on pearl)
  muted: '#6B5A5D', // secondary text (6.0:1 on pearl)
  border: '#EADFD6',
  danger: '#B65345', // Error terracotta — borders, icons, destructive buttons
  dangerText: '#9A4335', // terracotta for small text on tinted backgrounds (AA)
  dangerBg: '#F8E6E1',
  success: '#1E6B52', // Emerald — only "yes": accepted, sent, success (6.0:1 on pearl)
  successBg: '#E6F1EC',
  warningBg: '#F6EDD8',
  overlay: 'rgba(51, 9, 21, 0.55)',
  skeleton: '#EFE5DF',
} as const;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#4A0E1F',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  soft: {
    shadowColor: '#4A0E1F',
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
