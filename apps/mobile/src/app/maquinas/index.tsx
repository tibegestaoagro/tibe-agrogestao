import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MachineDetail } from '@/components/maquinas/machine-detail';
import { MachineForm } from '@/components/maquinas/machine-form';
import { MachineFilters, type MachineFilterValue } from '@/components/maquinas/machine-filters';
import { ListCard } from '@/components/ui/list-card';
import { PendingBanner } from '@/components/ui/pending-banner';
import { EmptyState, ErrorState, LoadingState, StaleBanner } from '@/components/ui/states';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import type { Machine } from '@/types/api';

/**
 * Máquinas: área-piloto da fundação de UI (decisão D7 do roadmap).
 *
 * Escolhida como piloto porque é a menor área com todos os elementos que as
 * outras vão precisar: lista, detalhe, cadastro, um sub-registro
 * (manutenção) e filtro. Se os primitivos funcionam aqui, funcionam nas
 * outras nove; se travam, travam num lugar barato de refazer.
 *
 * O filtro roda no CLIENTE porque `GET /api/v1/machines` não aceita
 * parâmetro nenhum hoje. Para o volume real (dezenas de máquinas por
 * fazenda) isso é irrelevante, e evita mexer no contrato da API só para
 * atender uma tela. Se um dia uma fazenda tiver centenas, o filtro sobe para
 * o servidor: a tela não muda, só a origem da lista.
 */
export default function MaquinasScreen() {
  const theme = useTheme();
  const { authedFetch } = useAuth();

  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [filters, setFilters] = useState<MachineFilterValue>({ type: null, status: null });
  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Machine | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await authedFetch<Machine[]>('/api/v1/machines');
      setMachines(data);
      setLoadedAt(new Date());
      setStale(false);
      setError(null);
    } catch (e) {
      // Já tinha lista: mantém na tela e MARCA como desatualizada, em vez de
      // trocar dado velho por uma tela de erro. Sumir com o que já estava
      // visível é pior do que mostrar com ressalva (decisão D4).
      if (machines) setStale(true);
      else setError(e instanceof Error ? e.message : 'Erro inesperado.');
    }
  }, [authedFetch, machines]);

  useEffect(() => {
    load();
    // Só na montagem: `load` muda de identidade a cada lista nova (depende de
    // `machines`), e incluí-lo aqui faria a tela recarregar em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const types = useMemo(
    () => Array.from(new Set((machines ?? []).map((m) => m.type))).sort(),
    [machines],
  );

  const visible = useMemo(
    () =>
      (machines ?? []).filter(
        (m) =>
          (!filters.type || m.type === filters.type) &&
          (!filters.status || m.status === filters.status),
      ),
    [machines, filters],
  );

  const filterCount = (filters.type ? 1 : 0) + (filters.status ? 1 : 0);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Máquinas',
          headerShown: true,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PendingBanner />
        {stale && loadedAt ? <StaleBanner since={loadedAt} /> : null}

        <View style={styles.toolbar}>
          <Pressable
            onPress={() => setFilterOpen(true)}
            accessibilityRole="button"
            style={[styles.toolButton, { borderColor: theme.backgroundSelected }]}
          >
            <ThemedText type="small" style={{ fontSize: 13 }}>
              Filtrar{filterCount > 0 ? ` (${filterCount})` : ''}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13 }}>
            {visible.length} de {machines?.length ?? 0}
          </ThemedText>
        </View>

        {machines === null && error === null ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {machines !== null && visible.length === 0 ? (
          <EmptyState
            title={filterCount > 0 ? 'Nenhuma máquina com esse filtro' : 'Nenhuma máquina ainda'}
            hint={
              filterCount > 0
                ? 'Ajuste o filtro para ver as outras.'
                : 'Cadastre o primeiro trator, implemento ou veículo da fazenda.'
            }
            actionLabel={filterCount > 0 ? 'Limpar filtro' : 'Cadastrar máquina'}
            onAction={
              filterCount > 0
                ? () => setFilters({ type: null, status: null })
                : () => setFormOpen(true)
            }
          />
        ) : null}

        <View style={styles.list}>
          {visible.map((m) => (
            <ListCard
              key={m.id}
              title={m.name}
              value={[m.type, m.hour_meter != null ? `${m.hour_meter} h` : null]
                .filter(Boolean)
                .join(' · ')}
              state={
                m.status === 'active'
                  ? { label: 'Ativa', tone: 'good' }
                  : { label: 'Inativa', tone: 'neutral' }
              }
              onPress={() => setSelected(m)}
            />
          ))}
        </View>
      </ScrollView>

      <Pressable
        onPress={() => setFormOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Cadastrar máquina"
        style={styles.fab}
      >
        <ThemedText style={styles.fabGlyph}>+</ThemedText>
      </Pressable>

      <MachineFilters
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onChange={setFilters}
        types={types}
      />

      <MachineForm visible={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />

      <MachineDetail
        machine={selected}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 96 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  list: { gap: Spacing.two },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabGlyph: { fontSize: 30, lineHeight: 34, color: Brand.light },
});
