import { createContext, useContext } from 'react';

export type ThemeName = 'dark' | 'light';

export type Colors = {
  bg: string;
  surface: string;
  surface2: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  gold: string;
  goldSoft: string;
  onGold: string;
  overlay: string;
  chart: string[];
};

const dark: Colors = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C1F',
  surfacePressed: '#232327',
  border: '#26262A',
  borderStrong: '#36363C',
  text: '#F4F4F2',
  textMuted: '#A3A3AB',
  textFaint: '#6E6E76',
  positive: '#22C38E',
  positiveSoft: 'rgba(34,195,142,0.12)',
  negative: '#F05252',
  negativeSoft: 'rgba(240,82,82,0.12)',
  warning: '#E9A23B',
  warningSoft: 'rgba(233,162,59,0.13)',
  gold: '#C8A66A',
  goldSoft: 'rgba(200,166,106,0.13)',
  onGold: '#141414',
  overlay: 'rgba(0,0,0,0.6)',
  chart: ['#C8A66A', '#8FA7C2', '#22C38E', '#B48CC9', '#D9826B', '#7FB5A8', '#A3A3AB'],
};

const light: Colors = {
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  surface2: '#EFEEE9',
  surfacePressed: '#E7E5DF',
  border: '#E3E1DA',
  borderStrong: '#CFCCC3',
  text: '#121212',
  textMuted: '#5D5D64',
  textFaint: '#8C8C93',
  positive: '#0A8A5F',
  positiveSoft: 'rgba(10,138,95,0.10)',
  negative: '#C53030',
  negativeSoft: 'rgba(197,48,48,0.09)',
  warning: '#B7791F',
  warningSoft: 'rgba(183,121,31,0.11)',
  gold: '#9C7A3C',
  goldSoft: 'rgba(156,122,60,0.12)',
  onGold: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.35)',
  chart: ['#9C7A3C', '#4F6F94', '#0A8A5F', '#7E5A9B', '#B4583F', '#3E7F70', '#6B6B73'],
};

export const themes: Record<ThemeName, Colors> = { dark, light };

/** 4-pt spacing scale */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
/** Minimum comfortable touch target on iPhone (Apple HIG: 44pt). */
export const TOUCH = 48;

export const type = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 },
  overline: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const },
};

export const ThemeContext = createContext<{ colors: Colors; name: ThemeName }>({ colors: dark, name: 'dark' });

export function useTheme() {
  return useContext(ThemeContext);
}
