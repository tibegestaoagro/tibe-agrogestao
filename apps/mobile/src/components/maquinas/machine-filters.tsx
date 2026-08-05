import { ChoiceField, PrimaryButton } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';

/**
 * Filtro em modal (decisão D3.4): a altura da tela é o recurso escasso no
 * celular, e uma barra de filtro fixa cobra esse espaço em toda visita, para
 * atender o uso ocasional. O modal cobra um toque só de quem vai filtrar.
 *
 * Aplica na hora da escolha, sem botão "aplicar": com dois campos, confirmar
 * seria um toque a mais para nada. O botão do rodapé só limpa.
 */
export type MachineFilterValue = { type: string | null; status: string | null };

export function MachineFilters({
  visible,
  onClose,
  value,
  onChange,
  types,
}: {
  visible: boolean;
  onClose: () => void;
  value: MachineFilterValue;
  onChange: (v: MachineFilterValue) => void;
  types: string[];
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filtrar máquinas"
      footer={
        <PrimaryButton
          label="Limpar filtro"
          onPress={() => {
            onChange({ type: null, status: null });
            onClose();
          }}
        />
      }
    >
      {types.length > 0 ? (
        <ChoiceField
          label="Tipo"
          options={types.map((t) => ({ value: t, label: t }))}
          value={value.type}
          onChange={(t) => onChange({ ...value, type: value.type === t ? null : t })}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Nenhum tipo cadastrado ainda.
        </ThemedText>
      )}

      <ChoiceField
        label="Situação"
        options={[
          { value: 'active', label: 'Ativa' },
          { value: 'inactive', label: 'Inativa' },
        ]}
        value={value.status}
        onChange={(s) => onChange({ ...value, status: value.status === s ? null : s })}
      />

      <Pressable onPress={onClose} accessibilityRole="button">
        <ThemedText type="small" themeColor="textSecondary">
          Tocar fora também fecha.
        </ThemedText>
      </Pressable>
    </Sheet>
  );
}
