import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PendingBanner } from '@/components/ui/pending-banner';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import {
  getBiometricSupport,
  isBiometricEnabled,
  promptBiometrics,
  setBiometricEnabled,
  type BiometricSupport,
} from '@/lib/biometrics';
import { useTheme } from '@/hooks/use-theme';

/**
 * "Mais": as 9 áreas que não couberam nas abas (decisão D1).
 *
 * Estar aqui não é rebaixamento, é frequência de uso: o produtor abre
 * Rebanho e Financeiro todo dia, e Calculadoras uma vez por safra. Nada foi
 * removido do produto.
 *
 * As áreas ainda não construídas aparecem MARCADAS, não escondidas. Esconder
 * faria o app parecer completo e o produtor procuraria pelo que não existe;
 * marcar diz a verdade sobre onde estamos.
 */

type Area = { href: string; label: string; glyph: string; ready: boolean };

const AREAS: Area[] = [
  { href: '/maquinas', label: 'Máquinas', glyph: '🚜', ready: true },
  { href: '/minha-fazenda', label: 'Minha Fazenda', glyph: '🏡', ready: false },
  { href: '/lavoura', label: 'Lavoura', glyph: '🌱', ready: false },
  { href: '/prestador', label: 'Prestador de Serviço', glyph: '🧰', ready: false },
  { href: '/meu-dia', label: 'Meu Dia', glyph: '📅', ready: false },
  { href: '/alertas', label: 'Alertas', glyph: '🔔', ready: false },
  { href: '/numeros', label: 'Fazenda em Números', glyph: '📊', ready: false },
  { href: '/calculadoras', label: 'Calculadoras', glyph: '🧮', ready: false },
  { href: '/configuracoes', label: 'Configurações', glyph: '⚙️', ready: false },
];

export default function MaisScreen() {
  const theme = useTheme();
  const { state, signOut } = useAuth();

  const [biometrics, setBiometrics] = useState<BiometricSupport>({ available: false, label: '' });
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    getBiometricSupport().then(setBiometrics);
    isBiometricEnabled().then(setBioEnabled);
  }, []);

  /**
   * Ativar exige passar na biometria AGORA. Sem isso, quem estivesse com o
   * aparelho destravado na mão de outra pessoa poderia ligar o atalho com a
   * digital dela, e a conta passaria a abrir para quem não é o dono.
   * Desativar não exige nada: reduzir o próprio acesso não precisa de prova.
   */
  const toggleBiometrics = useCallback(async (next: boolean) => {
    if (next && !(await promptBiometrics('Confirme para ativar'))) return;
    await setBiometricEnabled(next);
    setBioEnabled(next);
  }, []);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <PendingBanner />

        <View style={styles.grid}>
          {AREAS.map((area) =>
            area.ready ? (
              <Link key={area.href} href={area.href as never} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={area.label}
                  style={({ pressed }) => [
                    styles.tile,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <ThemedText style={styles.glyph}>{area.glyph}</ThemedText>
                  <ThemedText type="small" numberOfLines={2} style={styles.tileLabel}>
                    {area.label}
                  </ThemedText>
                </Pressable>
              </Link>
            ) : (
              <View
                key={area.href}
                accessibilityLabel={`${area.label}, ainda não disponível no aplicativo`}
                style={[styles.tile, { backgroundColor: theme.backgroundElement, opacity: 0.45 }]}
              >
                <ThemedText style={styles.glyph}>{area.glyph}</ThemedText>
                <ThemedText type="small" numberOfLines={2} style={styles.tileLabel}>
                  {area.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.soon}>
                  em breve
                </ThemedText>
              </View>
            ),
          )}
        </View>

        <View style={[styles.account, { borderTopColor: theme.backgroundSelected }]}>
          {biometrics.available ? (
            <View style={styles.switchRow}>
              <ThemedText type="small">Entrar com {biometrics.label}</ThemedText>
              <Switch
                value={bioEnabled}
                onValueChange={toggleBiometrics}
                trackColor={{ true: Brand.primary }}
                accessibilityLabel={`Entrar com ${biometrics.label}`}
              />
            </View>
          ) : null}

          {state.status === 'signedIn' && state.user ? (
            <ThemedText type="small" themeColor="textSecondary">
              {state.user.name} · {state.user.email}
            </ThemedText>
          ) : null}
          <Pressable onPress={signOut} accessibilityRole="button">
            <ThemedText type="smallBold" style={styles.signOut}>
              Sair da conta
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: Spacing.two,
  },
  glyph: { fontSize: 26, lineHeight: 32 },
  tileLabel: { textAlign: 'center', fontSize: 12, lineHeight: 15 },
  soon: { fontSize: 10 },
  account: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  signOut: { color: '#C2402F' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
