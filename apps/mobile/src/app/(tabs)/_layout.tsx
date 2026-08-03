import { Tabs } from 'expo-router';

import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Navegação principal do app autenticado (briefing da Onda 2, agente B2,
 * decisão 7): três telas, todas de leitura. Sem ícones customizados de
 * propósito — nesta rodada o objetivo é o esqueleto funcional (auth + dado
 * real), não o sistema visual definitivo (isso é trabalho da Onda 3, ver
 * docs/arquitetura/onda-1-briefings.md, seção "Sistema de design").
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected },
        tabBarActiveTintColor: Brand.primary,
        tabBarInactiveTintColor: theme.textSecondary,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="rebanho" options={{ title: 'Rebanho' }} />
      <Tabs.Screen name="financeiro" options={{ title: 'Financeiro' }} />
    </Tabs>
  );
}
