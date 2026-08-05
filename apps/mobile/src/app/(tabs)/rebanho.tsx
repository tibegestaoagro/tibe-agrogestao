import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ListCard } from '@/components/ui/list-card';
import { PendingBanner } from '@/components/ui/pending-banner';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Sheet } from '@/components/ui/sheet';
import { Spacing } from '@/constants/theme';
import { AuthExpiredError, toUserMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDateBR } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';
import type { AnimalBatch } from '@/types/api';

const SEX_LABEL: Record<string, string> = { male: 'Macho', female: 'Fêmea' };

/**
 * Rebanho: lista por CATEGORIA, não por animal.
 *
 * Refeita em 2026-08-04 junto com a unificação do back-end. Antes a tela
 * listava animais e mostrava o brinco como identificação e o status como
 * estado. Os dois deixaram de valer: o brinco é opcional (a maioria dos lotes
 * não tem) e `status` não existe mais, então a tela mostrava um campo vazio e
 * outro indefinido. O que identifica um lote agora é a CATEGORIA, e o número
 * que importa é a QUANTIDADE de cabeças.
 *
 * Segue as regras de densidade (D3): o cartão mostra 3 dados e o resto abre
 * no modal de detalhe, sem nada ser removido.
 */
export default function RebanhoScreen() {
  const { authedFetch } = useAuth();
  const theme = useTheme();

  const [batches, setBatches] = useState<AnimalBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AnimalBatch | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await authedFetch<AnimalBatch[]>('/api/v1/animals');
      setBatches(data);
    } catch (e) {
      if (e instanceof AuthExpiredError) return;
      setError(toUserMessage(e));
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totalCabecas = (batches ?? []).reduce((soma, b) => soma + b.quantity, 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PendingBanner />

        {batches !== null && batches.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {totalCabecas.toLocaleString('pt-BR')} cabeça(s) em {batches.length} registro(s)
          </ThemedText>
        ) : null}

        {batches === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {batches !== null && batches.length === 0 ? (
          <EmptyState
            title="Nenhum rebanho cadastrado"
            hint="Cadastre pelo painel web ou peça ao Tibé para registrar."
          />
        ) : null}

        {(batches ?? []).map((b) => (
          <ListCard
            key={b.id}
            title={b.category_name ?? 'Categoria não informada'}
            value={[
              b.ear_tag ? `Brinco ${b.ear_tag}` : null,
              b.breed,
              b.property_name,
            ]
              .filter(Boolean)
              .join(' · ')}
            state={
              b.quantity === 0
                ? { label: 'Sem saldo', tone: 'neutral' }
                : { label: `${b.quantity.toLocaleString('pt-BR')} cab`, tone: 'good' }
            }
            onPress={() => setSelected(b)}
          />
        ))}
      </ScrollView>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.category_name ?? 'Lote'}
      >
        {selected ? (
          <View style={styles.detail}>
            <Row label="Cabeças" value={selected.quantity.toLocaleString('pt-BR')} />
            <Row label="Brinco" value={selected.ear_tag ?? 'sem brinco'} />
            <Row label="Raça" value={selected.breed ?? 'não informada'} />
            <Row label="Sexo" value={selected.sex ? SEX_LABEL[selected.sex] : 'lote misto'} />
            <Row label="Fazenda" value={selected.property_name ?? 'não informada'} />
            <Row
              label="Peso médio"
              value={selected.average_weight != null ? `${selected.average_weight} kg` : 'sem valor'}
            />
            <Row
              label="Nascimento"
              value={selected.birth_date ? formatDateBR(selected.birth_date) : 'não informado'}
            />
            <Row
              label="Aquisição"
              value={selected.acquired_at ? formatDateBR(selected.acquired_at) : 'não informada'}
            />
            <Row
              label="Custo de aquisição"
              value={
                selected.acquisition_cost != null
                  ? `R$ ${selected.acquisition_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'não informado'
              }
            />
            <Row
              label="Última vacinação"
              value={
                selected.last_vaccination_at
                  ? formatDateBR(selected.last_vaccination_at)
                  : 'sem data'
              }
            />
          </View>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  detail: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  rowLabel: { flex: 1, fontSize: 13 },
  rowValue: { flex: 1.4, textAlign: 'right' },
});
