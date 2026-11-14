// Four type sizes and two weights keep the mobile hierarchy consistent.
export const typography = {
  caption: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600' as const, letterSpacing: -0.5 },
  display: { fontSize: 36, lineHeight: 44, fontWeight: '600' as const, letterSpacing: -1, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
};

export const layout = { gutter: 20, section: 24, cardRadius: 24, controlRadius: 16 };
