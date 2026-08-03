import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Brand, Spacing } from '@/constants/theme';

/**
 * Tela de login do aplicativo. Chama `POST /api/v1/auth/token` (via
 * `signIn()` do `AuthProvider`) com email e senha — a MESMA credencial do
 * login web, sem seletor de tenant (um email pertence a exatamente um
 * tenant, resolvido pelo servidor). Não existe lógica de validação de
 * negócio aqui: só o mínimo de UX (campos preenchidos) antes de mandar pro
 * servidor, que é quem decide de verdade se a credencial é válida.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Informe email e senha.');
      return;
    }
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <ThemedText type="title" style={styles.title}>
            Tibé
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.subtitle}>
            Gestão agropecuária
          </ThemedText>

          <View style={styles.form}>
            <ThemedText type="smallBold">Email</ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="voce@email.com"
              placeholderTextColor={theme.textSecondary}
              editable={!submitting}
              style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
            />

            <ThemedText type="smallBold" style={styles.labelSpacing}>
              Senha
            </ThemedText>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Sua senha"
              placeholderTextColor={theme.textSecondary}
              editable={!submitting}
              onSubmitEditing={handleSubmit}
              style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
            />

            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.button, { backgroundColor: Brand.primary, opacity: submitting ? 0.7 : 1 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText type="default" style={styles.buttonText}>
                  Entrar
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.five },
  form: { gap: Spacing.one },
  labelSpacing: { marginTop: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#DC2626', marginTop: Spacing.two },
  button: {
    marginTop: Spacing.four,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
});
