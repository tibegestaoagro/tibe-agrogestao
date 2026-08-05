import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Login por biometria (digital ou rosto).
 *
 * ## O que a biometria protege, e o que NÃO protege
 *
 * Ela NÃO substitui a autenticação: o que autentica continua sendo o refresh
 * token guardado no Keychain/Keystore. A biometria é um portão LOCAL na
 * frente desse token, para o produtor não digitar a senha toda vez num app
 * de uso diário. Quem não passa na biometria simplesmente cai na tela de
 * senha; nada é desbloqueado por ela sozinha.
 *
 * Por isso a preferência ("usar biometria") pode morar em armazenamento
 * comum: ela não é segredo. O segredo continua onde sempre esteve.
 *
 * ## Por que exigir um login por senha antes
 *
 * Habilitar biometria sem nunca ter provado a senha permitiria a alguém com
 * o aparelho desbloqueado e o dedo cadastrado entrar numa conta que nunca
 * usou ali. A ordem (senha uma vez, biometria depois) é o que amarra a
 * digital àquela conta específica.
 */

const PREF_KEY = 'tibe.biometrics.enabled';

export type BiometricSupport = {
  available: boolean;
  /** Rótulo para a interface: "Face ID", "Impressão digital". */
  label: string;
};

export async function getBiometricSupport(): Promise<BiometricSupport> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    // `hasHardware` sem `isEnrolled` = aparelho tem leitor mas o dono nunca
    // cadastrou digital. Oferecer nesse caso levaria a um prompt que sempre
    // falha, então conta como indisponível.
    if (!hasHardware || !enrolled) return { available: false, label: '' };

    const facial = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    );
    const label = facial
      ? Platform.OS === 'ios'
        ? 'Face ID'
        : 'Reconhecimento facial'
      : Platform.OS === 'ios'
        ? 'Touch ID'
        : 'Impressão digital';
    return { available: true, label };
  } catch {
    return { available: false, label: '' };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PREF_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await SecureStore.setItemAsync(PREF_KEY, '1');
    else await SecureStore.deleteItemAsync(PREF_KEY);
  } catch {
    // Preferência é conveniência: falhar em gravá-la não pode derrubar o
    // login. No pior caso o usuário digita a senha na próxima vez.
  }
}

/**
 * Pede a biometria. Devolve `true` só quando o sistema confirma.
 *
 * `disableDeviceFallback: false` deixa o próprio sistema oferecer o PIN do
 * aparelho quando a digital falha várias vezes: é o comportamento que o
 * usuário já conhece dos outros apps, e recusá-lo transformaria uma digital
 * suja em "não consigo mais entrar".
 */
export async function promptBiometrics(reason: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Usar senha',
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}
