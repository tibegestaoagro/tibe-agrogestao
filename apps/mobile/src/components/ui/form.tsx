import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Campos e botão dos formulários em modal de baixo.
 *
 * `Field` guarda o rótulo, o erro e o espaçamento juntos porque os três
 * sempre andam juntos: deixar a tela montar essa combinação faria cada
 * formulário posicionar o erro de um jeito. Aqui o erro sempre aparece
 * embaixo do campo, sempre com o mesmo espaço, sempre com a borda vermelha
 * ligada junto.
 */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  autoCapitalize,
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
  required?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        multiline={multiline}
        accessibilityLabel={label}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: error ? '#C2402F' : theme.backgroundSelected,
            minHeight: multiline ? 88 : 46,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Escolha entre poucas opções. Vira uma fileira de botões, não um seletor
 * nativo: com 2 a 5 opções (propriedade, tipo de máquina) a fileira mostra
 * tudo de uma vez e custa um toque, enquanto o seletor custa dois e esconde
 * as alternativas até abrir.
 */
export function ChoiceField<T extends string>({
  label,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  required?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </ThemedText>
      <View style={styles.choices}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.choice,
                {
                  backgroundColor: selected ? Brand.primary : theme.backgroundElement,
                  borderColor: selected ? Brand.primary : theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: selected ? Brand.light : theme.text, fontSize: 13 }}
              >
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = loading || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      style={({ pressed }) => [
        styles.primary,
        { opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={Brand.light} />
      ) : (
        <ThemedText type="smallBold" style={{ color: Brand.light }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: '#C2402F', fontSize: 13 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  primary: {
    backgroundColor: Brand.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
