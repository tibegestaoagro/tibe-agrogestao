import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Cartão de lista (decisão D3.1 do roadmap): mostra NO MÁXIMO 3 dados.
 *
 * A regra não é estética, é de leitura no celular: a lista existe para o
 * produtor achar a linha certa, não para ler a linha inteira. O resto abre
 * no modal de detalhe ao tocar, sem nada ser removido do produto.
 *
 * Por isso a interface aceita exatamente `title`, `value` e `state`, em vez
 * de uma lista livre de campos: um array deixaria a regra dos 3 como algo
 * que cada tela precisa lembrar de respeitar. Aqui ela é estrutural, e o
 * TypeScript recusa a quarta informação.
 */
export type ListCardProps = {
  /** Identificação: o que o produtor usa para reconhecer a linha. */
  title: string;
  /** O número que importa naquela área (cabeças, valor, horas). */
  value?: string | null;
  /** O estado atual, quando existir (vencido, ativo, pendente). */
  state?: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' } | null;
  onPress?: () => void;
};

const TONE_LIGHT = {
  neutral: { bg: '#E5DED5', fg: '#4A443B' },
  good: { bg: '#E4F0D3', fg: '#3D5C12' },
  warn: { bg: '#FCEFE2', fg: '#8A4A08' },
  bad: { bg: '#F8DAD5', fg: '#8A2118' },
} as const;

const TONE_DARK = {
  neutral: { bg: '#1A4A36', fg: '#C7D6CE' },
  good: { bg: '#2A4A14', fg: '#CDE5A6' },
  warn: { bg: '#4A3113', fg: '#F3C99A' },
  bad: { bg: '#4A1E19', fg: '#F0B4AC' },
} as const;

export function ListCard({ title, value, state, onPress }: ListCardProps) {
  const theme = useTheme();
  // Pergunta o esquema ao sistema, em vez de deduzir comparando a cor de
  // fundo: mudar um valor da paleta não pode inverter o tema dos selos.
  const isDark = useColorScheme() === 'dark';
  const tone = (state?.tone ?? 'neutral') as keyof typeof TONE_LIGHT;
  const toneColors = isDark ? TONE_DARK[tone] : TONE_LIGHT[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, value, state?.label].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.textColumn}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {value ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {value}
          </ThemedText>
        ) : null}
      </View>
      {state ? (
        <View style={[styles.badge, { backgroundColor: toneColors.bg }]}>
          <ThemedText type="small" style={{ color: toneColors.fg, fontSize: 12 }}>
            {state.label}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  textColumn: { flex: 1, gap: 2 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
});
