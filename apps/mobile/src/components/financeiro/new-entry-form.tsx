import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, AuthExpiredError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { FinancialEntryType } from '@/types/api';

const TYPE_LABEL: Record<FinancialEntryType, string> = { expense: 'despesa', income: 'receita' };

/**
 * Formulário de "registro rápido" (plano de arquitetura,
 * docs/arquitetura/plano-separacao-e-mobile.md, item 10: "telas de escrita:
 * registro rápido, com o mesmo padrão de confirmação do agente"). Só os
 * campos essenciais: categoria, valor, observação opcional; vencimento é
 * sempre hoje (sem seletor de data nesta rodada, de propósito: um lançamento
 * rápido é "isso aconteceu agora", o mesmo espírito do agente WhatsApp).
 *
 * `POST /api/v1/financial-entries` sempre nasce `related_module: geral`
 * (mesma regra do painel web, `src/lib/actions/financial-entries.ts`):
 * lançamento vinculado a outro módulo (venda de animal, ordem faturada)
 * nasce de lá, nunca daqui.
 */
export default function NewEntryForm({
  entryType,
  onCreated,
}: {
  entryType: FinancialEntryType;
  onCreated: () => void;
}) {
  const { authedFetch } = useAuth();
  const theme = useTheme();
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const trimmedCategory = category.trim();
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!trimmedCategory) {
      setError('Informe a categoria.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Informe um valor válido.');
      return;
    }

    setSubmitting(true);
    try {
      await authedFetch('/api/v1/financial-entries', {
        method: 'POST',
        json: {
          entry_type: entryType,
          category: trimmedCategory,
          amount: parsedAmount,
          due_date: new Date().toISOString(),
          notes: notes.trim() || undefined,
        },
      });
      setCategory('');
      setAmount('');
      setNotes('');
      onCreated();
    } catch (e) {
      if (e instanceof AuthExpiredError) return; // AuthProvider já derrubou a sessão.
      setError(e instanceof ApiError ? e.message : 'Não foi possível registrar o lançamento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">Nova {TYPE_LABEL[entryType]}, vencendo hoje</ThemedText>

      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder="Categoria"
        placeholderTextColor={theme.textSecondary}
        editable={!submitting}
        style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Valor (R$)"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        editable={!submitting}
        style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
      />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Observação (opcional)"
        placeholderTextColor={theme.textSecondary}
        editable={!submitting}
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
            Registrar
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  error: { color: '#DC2626' },
  button: { borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.one },
  buttonText: { color: '#ffffff', fontWeight: '700' },
});
