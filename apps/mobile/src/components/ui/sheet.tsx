import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Modal que sobe de baixo. É onde acontece TODA escrita do app (decisão
 * D3.3) e também o detalhe de um registro (D3.2).
 *
 * Um componente só para os dois casos, e não dois parecidos, porque a
 * diferença entre "ver tudo" e "preencher" é o conteúdo, não a moldura: as
 * duas precisam do mesmo fundo escurecido, do mesmo cabeçalho com fechar, do
 * mesmo respeito à área segura e ao teclado. Duplicar a moldura faria as
 * duas divergirem no primeiro ajuste.
 *
 * `KeyboardAvoidingView` existe porque o formulário mora na metade de baixo
 * da tela, exatamente onde o teclado aparece: sem isso o campo que está
 * sendo digitado fica embaixo do teclado no iOS.
 */
export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Ação principal fixa no rodapé (salvar). Ausente no modal de detalhe. */
  footer?: ReactNode;
  children: ReactNode;
};

export function Sheet({ visible, onClose, title, footer, children }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tocar fora fecha: no celular o alvo de toque mais fácil de
            acertar é a área grande, não o X de 24px no canto. */}
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fechar" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={styles.grabber}>
              <View style={[styles.grabberBar, { backgroundColor: theme.backgroundSelected }]} />
            </View>

            <View style={styles.header}>
              <ThemedText type="smallBold" style={styles.headerTitle} numberOfLines={1}>
                {title}
              </ThemedText>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
                <ThemedText type="small" themeColor="textSecondary">
                  Fechar
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    borderTopColor: theme.backgroundSelected,
                    paddingBottom: Math.max(insets.bottom, Spacing.three),
                  },
                ]}
              >
                {footer}
              </View>
            ) : (
              <View style={{ height: Math.max(insets.bottom, Spacing.two) }} />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  backdropTouch: { flex: 1 },
  keyboardWrap: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  grabber: { alignItems: 'center', paddingTop: Spacing.two },
  grabberBar: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  headerTitle: { flex: 1, fontSize: 16 },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.three },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: Spacing.three },
});
