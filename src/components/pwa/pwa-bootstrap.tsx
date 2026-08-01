import CaptureInstallPrompt from "@/components/pwa/capture-install-prompt";
import InstallInvite from "@/components/pwa/install-invite";
import RegisterServiceWorker from "@/components/pwa/register-service-worker";

/**
 * Ponto único de entrada do PWA no layout raiz (Onda 1, agente A3).
 *
 * Existe para o layout raiz ganhar uma linha só, em vez de duas importações e
 * dois elementos: `src/app/layout.tsx` é arquivo compartilhado e cada linha a
 * mais ali é conflito em potencial para quem editar depois.
 */
export default function PwaBootstrap() {
  return (
    <>
      <CaptureInstallPrompt />
      <RegisterServiceWorker />
      <InstallInvite />
    </>
  );
}
