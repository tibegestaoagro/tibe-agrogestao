/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Identidade visual do Tibé (mesmos valores de `tailwind.config.ts` no
 * painel web, chave "tibe"). Cores fixas (não variam por tema claro/escuro):
 * usadas em botões de ação e destaques, não em fundo/texto padrão de tela.
 *
 * Corrigido na rodada anterior: os valores antigos (`#2E7D32`/`#1B5E20`/
 * `#E8F5E9`) eram um placeholder da Onda 2 (esqueleto do app), anterior à
 * paleta oficial que o cliente enviou (Onda 4, `docs/idVisual/paleta-de
 * cores.png`) e que já corrigiu o painel web.
 */
export const Brand = {
  primary: '#649721',
  dark: '#022E20',
  darkest: '#09241B',
  light: '#FCF8F5',
  accent: '#E97D0F',
  accentDark: '#BA640C',
  accentLight: '#FCEFE2',
} as const;

/**
 * Fundo/texto/superfície por tema (claro/escuro, segue a preferência do
 * sistema, ver `use-theme.ts`). Corrigido nesta rodada: os valores
 * anteriores eram o cinza genérico do template do Expo (nunca tocados),
 * sem nenhuma relação com a marca: só `Brand` (botões/destaques) tinha
 * sido corrigido antes. O painel web não tem modo escuro definido (é só
 * claro); o escuro daqui reusa a mesma paleta verde-escura já usada na
 * barra lateral do painel (`tibe.darkest`/`tibe.dark`), não uma invenção
 * nova.
 */
export const Colors = {
  light: {
    text: '#0B1F16',
    background: Brand.light,
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E5DED5',
    textSecondary: '#6B6459',
  },
  dark: {
    text: Brand.light,
    background: Brand.darkest,
    backgroundElement: '#0F3327',
    backgroundSelected: '#1A4A36',
    textSecondary: '#9FB0A8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
