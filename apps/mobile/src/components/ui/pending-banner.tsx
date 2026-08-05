import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useQueue } from '@/lib/queue-context';

/**
 * Indicador de "N registros aguardando envio" (decisão D4).
 *
 * Aparece em toda tela de área, não só onde a escrita aconteceu: quem
 * cadastrou no pasto pode reabrir o app em outra tela, e uma pendência
 * invisível é indistinguível de um registro perdido. É a única forma de o
 * produtor confiar que anotar sem sinal funciona.
 *
 * Os recusados são separados dos pendentes porque a ação é diferente:
 * pendente resolve sozinho quando a conexão volta, recusado espera uma
 * decisão. Somar os dois num número só faria o contador nunca zerar e
 * treinaria o usuário a ignorá-lo.
 */
export function PendingBanner() {
  const { pending, failed, discard } = useQueue();
  if (pending.length === 0 && failed.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {pending.length > 0 ? (
        <View style={[styles.banner, { backgroundColor: Brand.accentLight }]}>
          <ThemedText type="small" style={{ color: Brand.accentDark, fontSize: 13 }}>
            {pending.length === 1
              ? '1 registro aguardando envio. Sobe sozinho quando a conexão voltar.'
              : `${pending.length} registros aguardando envio. Sobem sozinhos quando a conexão voltar.`}
          </ThemedText>
        </View>
      ) : null}

      {failed.map((item) => (
        <View key={item.id} style={[styles.banner, styles.failed]}>
          <ThemedText type="small" style={styles.failedText}>
            {item.label}: {item.failure?.message}
          </ThemedText>
          <Pressable
            onPress={() => discard(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Descartar ${item.label}`}
          >
            <ThemedText type="smallBold" style={styles.failedAction}>
              Descartar
            </ThemedText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  banner: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  failed: { backgroundColor: '#F8DAD5', gap: 6 },
  failedText: { color: '#8A2118', fontSize: 13 },
  failedAction: { color: '#8A2118', fontSize: 13, textDecorationLine: 'underline' },
});
