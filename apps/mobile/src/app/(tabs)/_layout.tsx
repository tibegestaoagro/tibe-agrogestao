import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Navegação principal (decisão D1 do roadmap do app mobile).
 *
 * O Tibé fica NO CENTRO e ELEVADO porque o assistente não é mais uma área:
 * é a porta de entrada do app. As 4 áreas de uso diário ficam a um toque; as
 * outras 9 vivem atrás de "Mais". Nada foi removido, só hierarquizado por
 * frequência de uso.
 *
 * Descartados: menu lateral espelhando a sidebar do painel web (2 toques
 * para tudo, e é padrão comprovadamente menos usado no celular) e tela-hub
 * sem abas (obriga voltar ao início a cada troca de área).
 *
 * Os ícones são emoji por enquanto. Não é descuido: trocar por um conjunto
 * de ícones de verdade é decisão de identidade visual, e emoji não custa
 * dependência nova nem trava a fundação enquanto essa decisão não vem.
 */

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <ThemedText style={[styles.icon, { opacity: focused ? 1 : 0.55 }]}>{glyph}</ThemedText>
  );
}

/** Botão central do Tibé: círculo elevado, acima da linha da barra. */
function TibeIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.tibeCircle, { opacity: focused ? 1 : 0.9 }]}>
      <ThemedText style={styles.tibeGlyph}>💬</ThemedText>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.backgroundSelected,
          height: Platform.select({ ios: 88, android: 68 }),
          paddingTop: 6,
        },
        tabBarActiveTintColor: Brand.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ focused }) => <TabIcon glyph="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="rebanho"
        options={{
          title: 'Rebanho',
          tabBarIcon: ({ focused }) => <TabIcon glyph="🐄" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tibe"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => <TibeIcon focused={focused} />,
          tabBarAccessibilityLabel: 'Tibé, o assistente',
        }}
      />
      <Tabs.Screen
        name="financeiro"
        options={{
          title: 'Financeiro',
          tabBarIcon: ({ focused }) => <TabIcon glyph="💰" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="mais"
        options={{
          title: 'Mais',
          tabBarIcon: ({ focused }) => <TabIcon glyph="☰" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22, lineHeight: 26 },
  tibeCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Sobe acima da linha da barra: é o que faz o botão ler como "principal"
    // em vez de "só mais uma aba com ícone diferente".
    marginTop: -22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  tibeGlyph: { fontSize: 26, lineHeight: 30 },
});
