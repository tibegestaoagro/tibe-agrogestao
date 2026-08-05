import { useEffect, useState } from 'react';

import { ChoiceField, Field, PrimaryButton } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { loadProperties } from '@/lib/reference-data';
import { useQueue } from '@/lib/queue-context';
import type { Property } from '@/types/api';

/**
 * Cadastro de máquina, em modal de baixo (decisão D3.3: toda escrita é
 * bottom sheet, nunca tela nova).
 *
 * Passa pela FILA (`useQueue().submit`), não por `authedFetch` direto: é o
 * que faz cadastrar no galpão sem sinal funcionar. Quando o item vai para a
 * fila, a tela diz isso em vez de fingir que salvou.
 *
 * Os números são digitados como texto e convertidos na hora do envio porque
 * o teclado numérico do Android aceita vírgula e o do iOS ponto: converter
 * só no envio evita brigar com o que o usuário está digitando no meio da
 * digitação.
 */

/** Aceita "1.234,56" e "1234.56": o teclado varia por plataforma. */
function toNumber(raw: string): number | null {
  const clean = raw.trim().replace(/\./g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function MachineForm({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authedFetch } = useAuth();
  const { submit } = useQueue();

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesFromCache, setPropertiesFromCache] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [hourMeter, setHourMeter] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [queuedNotice, setQueuedNotice] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Busca a lista de fazendas com CACHE: sem isso, o formulário não abria
    // sem sinal, e a fila de escrita ficava inútil no caso que ela existe
    // para resolver (cadastrar no curral). Defeito encontrado testando com
    // o modo avião ligado, não pelo tsc nem pelo lint.
    loadProperties(async () => (await authedFetch<Property[]>('/api/v1/properties')).data).then(
      ({ properties: list, fromCache }) => {
        setProperties(list);
        setPropertiesFromCache(fromCache);
        if (list.length === 1) setPropertyId(list[0].id);
      },
    );
  }, [visible, authedFetch]);

  function reset() {
    setName('');
    setType('');
    setBrand('');
    setModel('');
    setHourMeter('');
    setError(null);
    setQueuedNotice(false);
  }

  /** Marca o erro no PRÓPRIO campo, para a instrução aparecer junto do que ela manda corrigir. */
  function setFieldError(field: string, message: string) {
    setFieldErrors({ [field]: message });
  }

  async function save() {
    setError(null);
    setFieldErrors({});
    if (!propertyId) return setFieldError('property', 'Escolha a fazenda.');
    if (!name.trim()) return setFieldError('name', 'O nome é obrigatório.');
    if (!type.trim()) return setFieldError('type', 'O tipo é obrigatório.');

    setSaving(true);
    try {
      const res = await submit({
        path: '/api/v1/machines',
        method: 'POST',
        label: `Máquina ${name.trim()}`,
        body: {
          property_id: propertyId,
          name: name.trim(),
          type: type.trim(),
          brand: brand.trim() || null,
          model: model.trim() || null,
          hour_meter: toNumber(hourMeter),
        },
      });
      if (res.queued) {
        setQueuedNotice(true);
        setTimeout(() => {
          reset();
          onClose();
        }, 1400);
      } else {
        reset();
        onClose();
        onSaved();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não deu para salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Nova máquina"
      footer={<PrimaryButton label="Salvar máquina" onPress={save} loading={saving} />}
    >
      {queuedNotice ? (
        <ThemedText type="small" style={{ color: '#8A4A08' }}>
          Sem conexão: guardado no aparelho. Sobe sozinho quando a internet voltar.
        </ThemedText>
      ) : null}

      {properties.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nenhuma fazenda disponível sem conexão. Conecte-se uma vez: a lista fica guardada
          no aparelho e o cadastro passa a funcionar sem sinal.
        </ThemedText>
      ) : (
        <>
          <ChoiceField
            label="Fazenda"
            required
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            value={propertyId}
            onChange={setPropertyId}
            error={fieldErrors.property}
          />
          {propertiesFromCache ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
              Sem conexão: lista de fazendas guardada no aparelho. Uma fazenda cadastrada
              recentemente pode não aparecer.
            </ThemedText>
          ) : null}
        </>
      )}

      <Field
        label="Nome"
        required
        value={name}
        onChangeText={setName}
        placeholder="Trator 4x4"
        error={fieldErrors.name}
      />
      <Field
        label="Tipo"
        required
        value={type}
        onChangeText={setType}
        placeholder="Trator"
        error={fieldErrors.type}
      />
      <Field label="Marca" value={brand} onChangeText={setBrand} placeholder="John Deere" />
      <Field label="Modelo" value={model} onChangeText={setModel} placeholder="5075E" />
      <Field
        label="Horímetro"
        value={hourMeter}
        onChangeText={setHourMeter}
        placeholder="1250"
        keyboardType="decimal-pad"
      />

      {error ? (
        <ThemedText type="small" style={{ color: '#C2402F' }}>
          {error}
        </ThemedText>
      ) : null}
    </Sheet>
  );
}
