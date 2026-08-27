/**
 * Content-Security-Policy deste app, montada aqui porque a lista é longa demais
 * para caber legível dentro do array de cabeçalhos.
 *
 * `script-src` precisa de `'unsafe-inline'`: o Next injeta os dados de
 * hidratação como `<script>` embutido em toda página, e o projeto ainda tem um
 * script embutido próprio (o que captura `beforeinstallprompt` antes da
 * hidratação). Trocar isso por nonce exige mexer no layout e no componente, e
 * não é o escopo desta rodada.
 *
 * `'unsafe-eval'` entra só fora de produção: quem usa `eval` é o Fast Refresh do
 * `next dev`, não o bundle implantado.
 *
 * `style-src 'unsafe-inline'` é obrigatório enquanto houver Recharts: a
 * biblioteca escreve estilo direto no atributo `style` dos elementos do
 * gráfico.
 *
 * `img-src` aceita `data:` e `blob:` porque há QR code entregue como data URI e
 * pré-visualização de arquivo montada como blob no navegador.
 *
 * Sobre `fonts.googleapis.com` / `fonts.gstatic.com`: o `next/font/google`
 * baixa a fonte Inter em build e serve da própria origem, então o esperado é
 * que nada seja pedido ao Google em runtime. Os dois hosts ficam liberados como
 * margem, para não gerar relatório de violação por um caminho de fallback e
 * confundir a leitura dos relatórios de verdade.
 */
function contentSecurityPolicy() {
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Cabeçalhos de segurança, em todas as rotas e também em produção.
 *
 * A CSP vai em `Content-Security-Policy-Report-Only` de propósito, e promover
 * para bloqueio é decisão de outra rodada: o Recharts injeta estilo inline, o
 * service worker e o `next/font` têm superfície própria, e a fase seguinte do
 * projeto redesenha a interface inteira, ou seja, essa superfície ainda vai
 * mudar. Ligar o bloqueio agora quebraria tela em produção sem aviso.
 *
 * `Permissions-Policy` desliga camera, microphone, geolocation, payment e usb:
 * uma busca por `navigator.geolocation`, `getUserMedia` e `capture=` em `src/`
 * não encontra nenhum uso, então nenhum deles custa funcionalidade hoje.
 *
 * `Strict-Transport-Security` é redundante com o que a Vercel já manda, e é
 * declarado assim mesmo para a intenção não depender da plataforma de deploy.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // O produto não é embutido em iframe nenhum, próprio ou de terceiro.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // O Next 16 escreve sozinho um bloco de instrucoes para agentes dentro do
  // CLAUDE.md a cada `next dev`. Aqui isso nao pode ficar ligado: o texto que
  // ele gera usa travessao, que o invariante 4 deste projeto proibe e que o
  // hook de escrita e o `npm run check` reprovam. Entre a geracao automatica e
  // a regra do repositorio, quem manda e a regra.
  agentRules: false,

  // Sem isto, validar no navegador nesta maquina e impossivel, e o sintoma
  // engana: a pagina carrega o HTML e fica em carregamento infinito.
  //
  // O Next 16 bloqueia os chunks de `/_next/*` quando a origem do pedido nao e
  // a que ele anuncia (`localhost:3000`). Aqui `localhost` NAO resolve, e o
  // proprio CLAUDE.md ja documenta isso para a conexao com o Postgres do
  // Docker: sobra `127.0.0.1`, que o Next entao recusa por ser outra origem.
  // Os dois caminhos fechados, e o defeito parece de aplicacao.
  //
  // O IP da rede local entra junto porque e por ele que se abre o painel no
  // celular de verdade, que e como varios defeitos deste projeto apareceram.
  // Vale so em `next dev`.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.6"],

  async headers() {
    const rules = [{ source: "/:path*", headers: securityHeaders }];

    // CORS só em desenvolvimento, só pra /api/v1/*: o app mobile (Expo) rodado
    // via `expo start --web` (apps/mobile) fica numa origem diferente
    // (localhost:8081) da API (localhost:3000), e só o navegador aplica CORS
    // (apps nativos iOS/Android, o alvo real do app mobile, não são afetados
    // por isso). Nunca roda em produção (`next build` seta NODE_ENV=production
    // sozinho): a API implantada continua sem cabeçalho CORS nenhum.
    if (process.env.NODE_ENV !== "production") {
      rules.push({
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      });
    }

    return rules;
  },
};

export default nextConfig;
