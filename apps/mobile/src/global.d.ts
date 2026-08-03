// Import de efeito colateral (`import '@/global.css'`, constants/theme.ts):
// sem isso, `tsc --noEmit` falha com TS2882 mesmo o bundler (Metro)
// resolvendo o arquivo normalmente em runtime. Gap pré-existente do
// esqueleto (Onda 2), só visível depois que `node_modules` foi instalado
// pela primeira vez nesta rodada.
declare module "*.css";
