import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { AuthExpiredError } from '@/lib/api-client';
import { formatCurrencyBRL } from '@/lib/format';
import type { CashFlowBucket } from '@/types/api';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  VISUALIZADOR: 'Visualizador',
};

/**
 * Tela Início (briefing, decisão 7): nome de quem está logado + saldo do
 * mês. O saldo vem de `GET /api/v1/financial/cash-flow?group_by=month`
 * (regime de caixa, mesma fonte que `getBalanceAction` usa no dashboard
 * web) chamada SEM `start`/`end`: o back-end já aplica o mês corrente como
 * padrão (`resolvePeriod`/`defaultMonthRange` em
 * src/lib/actions/financial-reports.ts), então o app não precisa calcular
 * nenhuma data: isso seria regra de negócio vazando pro cliente.
 *
 * Não existe rota `/api/v1` que devolva o nome da fazenda/tenant hoje (o
 * painel web busca isso direto no Prisma, dentro de um Server Component,
 * não por HTTP, ver `(dashboard)/layout.tsx`): por isso esta tela mostra
 * só o nome de quem logou, não o nome da fazenda. Ver relatório final desta
 * rodada para o detalhe.
 */
export default function InicioScreen() {
  const { state, authedFetch, signOut } = useAuth();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<CashFlowBucket | null>(null);

  const user = state.status === 'signedIn' ? state.user : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await authedFetch<CashFlowBucket[]>('/api/v1/financial/cash-flow?group_by=month');
      setBalance(data[0] ?? null);
    } catch (e) {
      if (e instanceof AuthExpiredError) return; // AuthProvider já derrubou a sessão; a navegação troca sozinha.
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o saldo do mês.');
    }
  }, [authedFetch]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View>
          <ThemedText type="title" style={styles.greeting}>
            {user?.name ? `Olá, ${user.name.split(' ')[0]}` : 'Olá'}
          </ThemedText>
          {user?.role && (
            <ThemedText type="small" themeColor="textSecondary">
              {ROLE_LABEL[user.role] ?? user.role}
            </ThemedText>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Saldo do mês
          </ThemedText>
          {loading ? (
            <ActivityIndicator style={styles.cardLoading} />
          ) : (
            <ThemedText type="title" style={styles.balanceValue}>
              {formatCurrencyBRL(balance?.balance ?? 0)}
            </ThemedText>
          )}
          {!loading && (
            <View style={styles.balanceRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Entradas: {formatCurrencyBRL(balance?.income ?? 0)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Saídas: {formatCurrencyBRL(balance?.expense ?? 0)}
              </ThemedText>
            </View>
          )}
        </View>

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable onPress={() => signOut()} style={styles.signOut}>
          <ThemedText type="link" themeColor="textSecondary">
            Sair
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: Spacing.four, gap: Spacing.four },
  greeting: { fontSize: 28, lineHeight: 32 },
  card: { borderRadius: Spacing.three, padding: Spacing.four, gap: Spacing.two },
  cardLoading: { alignSelf: 'flex-start', marginTop: Spacing.two },
  balanceValue: { fontSize: 32, lineHeight: 36 },
  balanceRow: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.one },
  error: { color: '#DC2626' },
  signOut: { alignSelf: 'flex-start', marginTop: Spacing.two },
});
