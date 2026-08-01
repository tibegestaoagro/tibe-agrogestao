/**
 * Captura o evento `beforeinstallprompt` antes da hidratação do React.
 *
 * Por que isto existe (achado em teste real, não em teoria): o Chrome dispara
 * `beforeinstallprompt` durante o carregamento do documento, ANTES de o React
 * hidratar. Um `addEventListener` dentro de `useEffect` chega tarde e nunca vê
 * o evento, e o convite de instalação simplesmente nunca aparece, sem erro
 * nenhum no console. Medido com um ouvinte injetado antes dos scripts da
 * página: o evento disparava, e o componente não o recebia.
 *
 * A solução é um script embutido, que roda enquanto o HTML é lido: ele guarda o
 * evento em `window` e avisa o componente. `InstallInvite` lê o que já estiver
 * guardado no `mount` e também escuta o aviso, então funciona nas duas ordens.
 *
 * `preventDefault()` é o que impede a barra padrão do Chrome de aparecer por
 * cima do convite do produto.
 *
 * Se um dia o projeto ganhar Content-Security-Policy, este `<script>` embutido
 * precisa de nonce.
 */

const CAPTURE_SCRIPT = `(function(){
  window.__tibeInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__tibeInstallPrompt = event;
    window.dispatchEvent(new Event("tibe:installprompt"));
  });
})();`;

export default function CaptureInstallPrompt() {
  return <script dangerouslySetInnerHTML={{ __html: CAPTURE_SCRIPT }} />;
}
