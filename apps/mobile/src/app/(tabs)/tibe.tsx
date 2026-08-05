import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * O Tibé, o assistente. **Esqueleto de propósito.**
 *
 * O interior desta tela é a peça 5 do roadmap e depende de uma decisão de
 * arquitetura que ainda não foi tomada: onde roda o LLM (dentro do back-end
 * Next.js ou num serviço à parte) e se ele substitui ou convive com o
 * classificador de intenção que hoje vive no N8N.
 *
 * A aba existe desde já porque a navegação inteira foi desenhada em volta
 * dela (decisão D1): construir as 5 abas com um buraco no meio, para
 * preencher depois, mudaria a hierarquia visual duas vezes.
 *
 * O que JÁ existe no back-end e será reaproveitado: `routeIntent`
 * (canal-agnóstico desde o Módulo 3, hoje usado pelo WhatsApp) e a confirmação
 * acima de R$ 5.000. O que falta: a classificação por LLM e um endpoint
 * autenticado por sessão do app, já que `/api/internal/whatsapp/*` autentica
 * por segredo compartilhado, desenhado para o N8N.
 */
export default function TibeScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.content}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarGlyph}>💬</ThemedText>
        </View>
        <ThemedText type="smallBold" style={styles.title}>
          O Tibé ainda está sendo montado
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          Aqui você vai poder falar ou escrever o que aconteceu na fazenda, mandar a foto de
          uma nota, e o Tibé registra para você. Por enquanto, use as abas para lançar.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: { fontSize: 34, lineHeight: 40 },
  title: { fontSize: 16, textAlign: 'center' },
  body: { textAlign: 'center' },
});
