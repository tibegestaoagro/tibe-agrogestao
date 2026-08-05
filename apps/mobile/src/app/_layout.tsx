import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { QueueProvider } from '@/lib/queue-context';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

/**
 * Layout raiz do app. Só tem uma responsabilidade: decidir, a partir do
 * estado de sessão (`AuthProvider`), se quem abriu o app vê o grupo
 * autenticado `(tabs)` ou a tela `login`. Nenhuma tela decide isso sozinha:
 * é o padrão de "rotas protegidas" atual do Expo Router (`Stack.Protected`
 * com uma guarda booleana), que troca de grupo automaticamente quando o
 * estado muda (ex: sessão expira no meio do uso, ou logout).
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      {/* A fila de escrita fica DENTRO do AuthProvider porque precisa do
          `authedFetch` para subir os itens, e do estado de sessão para não
          tentar subir deslogado. Fica FORA do navegador para sobreviver à
          troca de tela: um item enfileirado no Rebanho continua na fila
          quando o usuário vai para o Financeiro. */}
      <QueueProvider>
        <RootNavigator />
      </QueueProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { state } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (state.status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [state.status]);

  if (state.status === 'loading') {
    // Renovação silenciosa do refresh token salvo ainda em andamento
    // (briefing, decisão 5): a splash nativa já cobre esse instante inicial,
    // isto é só a rede de segurança caso demore.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={state.status === 'signedIn'}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === 'signedOut'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
