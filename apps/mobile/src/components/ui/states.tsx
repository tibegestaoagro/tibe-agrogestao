import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Estados de tela: carregando, vazio, erro, e o aviso de dado desatualizado.
 *
 * Ficam juntos porque toda lista do app precisa dos quatro e eles compartilham
 * a mesma moldura centrada. Separar em quatro arquivos de 20 linhas espalharia
 * uma decisão única (como o app se comporta quando não tem o que mostrar) por
 * quatro lugares que passariam a divergir.
 */

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={Brand.primary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ color: theme.textSecondary }}>
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * Tela vazia é um convite para agir, não um aviso de falta: por isso aceita
 * uma ação, e o texto diz o que fazer em vez de só constatar o vazio.
 */
export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {hint}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={styles.emptyAction}>
          <ThemedText type="smallBold" style={{ color: Brand.light }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Erro diz o que houve E como sair dele. Nunca só "erro inesperado". */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <ThemedText type="smallBold">Não deu para carregar</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {message}
      </ThemedText>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" style={styles.emptyAction}>
          <ThemedText type="smallBold" style={{ color: Brand.light }}>
            Tentar de novo
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Faixa de "dado desatualizado" (decisão D4): leitura exige conexão, então
 * quando a busca falha o app mostra o que tinha em vez de uma tela vazia, mas
 * precisa dizer que aquilo pode não valer mais. Mostrar dado velho sem avisar
 * é pior do que não mostrar nada: o produtor decide com base no número.
 */
export function StaleBanner({ since }: { since: Date }) {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
        Sem conexão. Mostrando os dados de{' '}
        {since.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  hint: { textAlign: 'center' },
  emptyAction: {
    marginTop: Spacing.two,
    backgroundColor: Brand.primary,
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    paddingVertical: 10,
  },
  banner: {
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
