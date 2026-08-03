import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { AuthExpiredError } from '@/lib/api-client';
import { formatDateBR } from '@/lib/format';
import type { Animal } from '@/types/api';

const STATUS_LABEL: Record<Animal['status'], string> = {
  active: 'Ativo',
  sold: 'Vendido',
  deceased: 'Morto',
};

const SEX_LABEL: Record<Animal['sex'], string> = { male: 'Macho', female: 'Fêmea' };

/**
 * Tela Rebanho (briefing, decisão 7): lista de animais de
 * `GET /api/v1/animals`, a mesma rota que o painel web usa para listar
 * (a página `(dashboard)/rebanho/page.tsx` no web busca direto no Prisma
 * por ser Server Component, mas o contrato de campos é o mesmo desta rota
 * — ver `src/lib/serializers.ts`, `serializeAnimal`). Sem filtro nem busca
 * nesta rodada (só leitura simples, "esqueleto"); a rota já suporta
 * `property_id`/`status`/`breed`/`q` se um filtro for adicionado depois.
 *
 * Exige o perfil "fazenda" ativo no tenant (mesma regra do back-end,
 * `guard("rebanho", "read", { profile: "fazenda" })`): um tenant só-
 * prestador de serviço recebe `PROFILE_INACTIVE` da API, mostrado aqui como
 * qualquer outro erro — não é tratado como caso especial no app.
 */
export default function RebanhoScreen() {
  const { authedFetch } = useAuth();
  const theme = useTheme();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await authedFetch<Animal[]>('/api/v1/animals');
      setAnimals(data);
    } catch (e) {
      if (e instanceof AuthExpiredError) return;
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o rebanho.');
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
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : (
        <FlatList
          data={animals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <ThemedText type="small" themeColor="textSecondary">
                {error ?? 'Nenhum animal cadastrado.'}
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.rowHeader}>
                <ThemedText type="smallBold">{item.ear_tag}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {STATUS_LABEL[item.status] ?? item.status}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {item.breed ?? 'raça não informada'} · {SEX_LABEL[item.sex]}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.property_name ?? 'propriedade não informada'}
                {item.current_weight != null ? ` · ${item.current_weight} kg` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Última vacinação: {item.last_vaccination_at ? formatDateBR(item.last_vaccination_at) : 'sem data'}
              </ThemedText>
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
  list: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  row: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
});
