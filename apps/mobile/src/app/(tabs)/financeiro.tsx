import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import NewEntryForm from '@/components/financeiro/new-entry-form';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Brand, Spacing } from '@/constants/theme';
import { ApiError, AuthExpiredError } from '@/lib/api-client';
import { formatCurrencyBRL, formatDateBR } from '@/lib/format';
import type { FinancialEntry, FinancialEntryType } from '@/types/api';

const TAB_TITLE: Record<FinancialEntryType, string> = { expense: 'A pagar', income: 'A receber' };
const EMPTY_LABEL: Record<FinancialEntryType, string> = {
  expense: 'Nenhum lançamento a pagar.',
  income: 'Nenhum lançamento a receber.',
};

// Mesmo texto usado no painel web para o status de um FinancialEntry
// (`(dashboard)/financeiro/page.tsx`): o app só mostra o status como o
// back-end devolve, nunca infere "vencido" comparando datas: isso seria
// regra de negócio duplicada no cliente.
const STATUS_LABEL: Record<FinancialEntry['status'], string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
};

/**
 * Tela Financeiro (briefing, decisão 7 + telas de escrita desta rodada,
 * docs/arquitetura/plano-separacao-e-mobile.md item 10): contas a pagar e a
 * receber, isto é, `FinancialEntry` com `status=pending`, filtrado por
 * `entry_type` (um alternador local decide qual dos dois listar). Mesma
 * fonte de dado que o `resumo` do agente WhatsApp usa para
 * `contas_a_pagar`/`contas_a_receber` (`src/lib/actions/financial-reports.ts`,
 * `listPendingEntries`), consumida aqui pela rota HTTP equivalente e já
 * existente, `GET /api/v1/financial-entries?status=pending&entry_type=...`
 * (`src/app/api/v1/financial-entries/route.ts`), não a função da action
 * diretamente, que não é HTTP.
 *
 * Escrita (nova nesta rodada): "marcar como pago" por linha
 * (`PATCH .../:id/pay`) e "novo lançamento" (`POST /api/v1/financial-entries`,
 * ver `new-entry-form.tsx`). `canWrite` abaixo só esconde o botão pra quem
 * não escreve (mesma regra de `canWrite(role, "financeiro")` no painel web,
 * `src/lib/permissions.ts`): a garantia de verdade continua sendo o
 * `guard("financeiro", "write")` no back-end, não esta checagem de UI.
 */
export default function FinanceiroScreen() {
  const { authedFetch, state } = useAuth();
  const theme = useTheme();
  const [kind, setKind] = useState<FinancialEntryType>('expense');
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const role = state.status === 'signedIn' ? state.user?.role : null;
  const canWrite = role != null && role !== 'VISUALIZADOR';

  const load = useCallback(
    async (target: FinancialEntryType) => {
      setError(null);
      try {
        const { data } = await authedFetch<FinancialEntry[]>(
          `/api/v1/financial-entries?status=pending&entry_type=${target}`,
        );
        setEntries(data);
      } catch (e) {
        if (e instanceof AuthExpiredError) return;
        setError(e instanceof Error ? e.message : 'Não foi possível carregar os lançamentos.');
      }
    },
    [authedFetch],
  );

  useEffect(() => {
    setLoading(true);
    setFormOpen(false);
    load(kind).finally(() => setLoading(false));
  }, [kind, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(kind);
    setRefreshing(false);
  }, [kind, load]);

  const handleCreated = useCallback(async () => {
    setFormOpen(false);
    await load(kind);
  }, [kind, load]);

  const handleMarkPaid = useCallback(
    async (id: string) => {
      setPayingId(id);
      setError(null);
      try {
        await authedFetch(`/api/v1/financial-entries/${id}/pay`, { method: 'PATCH', json: {} });
        await load(kind);
      } catch (e) {
        if (e instanceof AuthExpiredError) return;
        setError(e instanceof ApiError ? e.message : 'Não foi possível marcar como pago.');
      } finally {
        setPayingId(null);
      }
    },
    [authedFetch, kind, load],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.toggleRow}>
        {(['expense', 'income'] as FinancialEntryType[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={[styles.toggleButton, { borderColor: Brand.primary }, kind === k && { backgroundColor: Brand.primary }]}
          >
            <ThemedText type="smallBold" style={kind === k ? styles.toggleTextActive : undefined}>
              {TAB_TITLE[k]}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {canWrite && (
        <Pressable onPress={() => setFormOpen((v) => !v)} style={styles.newEntryToggle}>
          <ThemedText type="smallBold" style={{ color: Brand.primary }}>
            {formOpen ? 'Cancelar' : `+ Novo lançamento (${TAB_TITLE[kind].toLowerCase()})`}
          </ThemedText>
        </Pressable>
      )}
      {formOpen && (
        <View style={styles.formWrap}>
          <NewEntryForm entryType={kind} onCreated={handleCreated} />
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <ThemedText type="small" themeColor="textSecondary">
                {error ?? EMPTY_LABEL[kind]}
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.rowHeader}>
                <ThemedText type="smallBold">{item.category ?? 'Sem categoria'}</ThemedText>
                <ThemedText type="smallBold">{formatCurrencyBRL(item.amount ?? 0)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Vencimento: {formatDateBR(item.due_date)} · {STATUS_LABEL[item.status] ?? item.status}
              </ThemedText>
              {canWrite && item.status === 'pending' && (
                <Pressable
                  onPress={() => handleMarkPaid(item.id)}
                  disabled={payingId === item.id}
                  style={[styles.payButton, { borderColor: Brand.primary, opacity: payingId === item.id ? 0.6 : 1 }]}
                >
                  {payingId === item.id ? (
                    <ActivityIndicator size="small" color={Brand.primary} />
                  ) : (
                    <ThemedText type="small" style={{ color: Brand.primary }}>
                      Marcar como pago
                    </ThemedText>
                  )}
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  toggleRow: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.four, paddingBottom: 0 },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  toggleTextActive: { color: '#ffffff' },
  newEntryToggle: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  formWrap: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  list: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  row: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  payButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginTop: Spacing.one,
  },
});
