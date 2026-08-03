/** @type {import('next').NextConfig} */
const nextConfig = {
  // CORS só em desenvolvimento, só pra /api/v1/*: o app mobile (Expo) rodado
  // via `expo start --web` (apps/mobile) fica numa origem diferente
  // (localhost:8081) da API (localhost:3000), e só o navegador aplica CORS
  // (apps nativos iOS/Android, o alvo real do app mobile, não são afetados
  // por isso). Nunca roda em produção (`next build` seta NODE_ENV=production
  // sozinho): a API implantada continua sem cabeçalho CORS nenhum.
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
