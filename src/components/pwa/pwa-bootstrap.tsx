import CaptureInstallPrompt from "@/components/pwa/capture-install-prompt";
import RegisterServiceWorker from "@/components/pwa/register-service-worker";

/**
 * Ponto único de entrada do PWA no layout raiz (Onda 1, agente A3).
 *
 * Existe para o layout raiz ganhar uma linha só, em vez de duas importações e
 * dois elementos: `src/app/layout.tsx` é arquivo compartilhado e cada linha a
 * mais ali é conflito em potencial para quem editar depois.
 *
 * `InstallInvite` (o banner visível) NÃO mora aqui de propósito (decisão do
 * usuário, 2026-08-01): só aparece dentro do painel autenticado, montado no
 * layout do dashboard. `CaptureInstallPrompt` continua global: o navegador
 * pode disparar `beforeinstallprompt` em qualquer página (home, /planos,
 * /login) antes do usuário chegar ao painel, e perder esse evento por não
 * estar escutando cedo o suficiente não tem como ser desfeito depois.
 */
export default function PwaBootstrap() {
  return (
    <>
      <CaptureInstallPrompt />
      <RegisterServiceWorker />
    </>
  );
}
