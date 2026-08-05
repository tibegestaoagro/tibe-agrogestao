import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Field, PrimaryButton } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { LoadingState } from '@/components/ui/states';
import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useQueue } from '@/lib/queue-context';
import { useTheme } from '@/hooks/use-theme';
import type { Machine, MachineDetailData } from '@/types/api';

/**
 * Detalhe da máquina (decisão D3.2): mostra TUDO que a tela web mostra.
 *
 * O cartão da lista mostra 3 dados; aqui nada é recolhido. Essa é a metade
 * que torna a regra dos 3 honesta: sem ela, limitar o cartão seria esconder
 * informação do produtor, não organizá-la.
 *
 * Registrar manutenção acontece no MESMO modal, numa seção abaixo, em vez de
 * abrir um segundo modal por cima: empilhar bottom sheets no celular é onde o
 * usuário se perde, e a manutenção só faz sentido no contexto da máquina que
 * já está aberta.
 */

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

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export function MachineDetail({
  machine,
  onClose,
  onChanged,
}: {
  machine: Machine | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const { authedFetch } = useAuth();
  const { submit } = useQueue();

  const [full, setFull] = useState<MachineDetailData | null>(null);
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!machine) {
      setFull(null);
      return;
    }
    setDescription('');
    setCost('');
    setError(null);
    setNotice(null);
    authedFetch<MachineDetailData>(`/api/v1/machines/${machine.id}`)
      .then(({ data }) => setFull(data))
      // Sem conexão, mostra o que a lista já tinha em vez de travar o modal:
      // é menos que o completo, mas é o que existe.
      .catch(() => setFull(machine));
  }, [machine, authedFetch]);

  async function saveMaintenance() {
    if (!machine) return;
    setError(null);
    if (!description.trim()) return setError('Descreva o que foi feito.');

    setSaving(true);
    try {
      const clean = cost.trim().replace(/\./g, '').replace(',', '.');
      const res = await submit({
        path: `/api/v1/machines/${machine.id}/maintenances`,
        method: 'POST',
        label: `Manutenção de ${machine.name}`,
        body: {
          description: description.trim(),
          cost: clean ? Number(clean) : null,
          performed_at: new Date().toISOString(),
        },
      });
      setDescription('');
      setCost('');
      if (res.queued) {
        setNotice('Sem conexão: guardado no aparelho e enviado quando a internet voltar.');
      } else {
        setNotice('Manutenção registrada.');
        onChanged();
        const { data } = await authedFetch<MachineDetailData>(`/api/v1/machines/${machine.id}`);
        setFull(data);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não deu para registrar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={!!machine} onClose={onClose} title={machine?.name ?? ''}>
      {!full ? (
        <LoadingState />
      ) : (
        <>
          <View style={styles.block}>
            <Row label="Tipo" value={full.type} />
            <Row label="Marca" value={full.brand ?? 'não informada'} />
            <Row label="Modelo" value={full.model ?? 'não informado'} />
            <Row label="Ano" value={full.year != null ? String(full.year) : 'não informado'} />
            <Row
              label="Horímetro"
              value={full.hour_meter != null ? `${full.hour_meter} h` : 'não informado'}
            />
            <Row
              label="Valor de compra"
              value={full.acquisition_cost != null ? brl(full.acquisition_cost) : 'não informado'}
            />
            <Row
              label="Comprada em"
              value={full.acquired_at ? date(full.acquired_at) : 'não informado'}
            />
            <Row label="Situação" value={full.status === 'active' ? 'Ativa' : 'Inativa'} />
            <Row
              label="Próxima manutenção"
              value={full.next_maintenance_at ? date(full.next_maintenance_at) : 'sem previsão'}
            />
          </View>

          {full.maintenances && full.maintenances.length > 0 ? (
            <View style={styles.block}>
              <ThemedText type="smallBold">Manutenções</ThemedText>
              {full.maintenances.map((m) => (
                <View
                  key={m.id}
                  style={[styles.maintenance, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="small">{m.description}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                    {[
                      m.performed_at ? date(m.performed_at) : null,
                      m.cost != null ? brl(m.cost) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'sem data'}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.block, { borderTopColor: theme.backgroundSelected }, styles.formBlock]}>
            <ThemedText type="smallBold">Registrar manutenção</ThemedText>
            <Field
              label="O que foi feito"
              required
              value={description}
              onChangeText={setDescription}
              placeholder="Troca de óleo e filtros"
              multiline
            />
            <Field
              label="Custo"
              value={cost}
              onChangeText={setCost}
              placeholder="450,00"
              keyboardType="decimal-pad"
            />
            {error ? (
              <ThemedText type="small" style={{ color: '#C2402F' }}>
                {error}
              </ThemedText>
            ) : null}
            {notice ? (
              <ThemedText type="small" style={{ color: '#3D5C12' }}>
                {notice}
              </ThemedText>
            ) : null}
            <PrimaryButton label="Registrar" onPress={saveMaintenance} loading={saving} />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  formBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  rowLabel: { flex: 1, fontSize: 13 },
  rowValue: { flex: 1.4, textAlign: 'right' },
  maintenance: { borderRadius: 10, padding: Spacing.three, gap: 2 },
});
