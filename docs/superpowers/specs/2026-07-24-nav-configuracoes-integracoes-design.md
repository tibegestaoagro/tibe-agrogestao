# Navegação: Configurações > Integrações > WhatsApp

**Data:** 2026-07-24 · **Status:** aprovado (missão loop-goal, decisões via AskUserQuestion na conversa)

## Contexto e objetivo

O painel da plataforma (`/plataforma`) tem hoje 4 itens fixos na sidebar: KPIs,
Tenants, Equipe, WhatsApp. Conforme cresce o número de integrações (Evolution,
Meta Cloud API, futuras), um item solto "WhatsApp" não escala. Objetivo:
agrupar tudo que é "configuração administrativa" (equipe da plataforma +
integrações externas) sob um único item **Configurações**, com telas de cards.

## Decisões já fechadas

- Sidebar reduz a **3 itens**: KPIs, Tenants, Configurações.
- `/plataforma/configuracoes`: tela nova com 2 cards: **Equipe** e
  **Integrações**.
- `/plataforma/configuracoes/integracoes`: tela nova com cards por
  integração; hoje só **WhatsApp**.
- `/plataforma/configuracoes/whatsapp`: **continua existindo no mesmo path**
  (nenhuma mudança na página em si, só como ela é alcançada). Não precisa
  virar `/configuracoes/integracoes/whatsapp`: manter o path atual evita
  reescrever links/testes que já referenciam essa URL.
- `/plataforma/configuracoes/equipe`: **continua existindo no mesmo path**,
  só passa a ser alcançada a partir do card, não mais direto da sidebar.
- Ambas as sub-telas (equipe, whatsapp) continuam **só master_admin**
  (redirect para `/plataforma/tenants` se `equipe` tentar acessar: mesmo
  guard que já existe hoje nelas, não muda).

## Design das telas novas

### `/plataforma/configuracoes` (server component)

Mesmo padrão visual dark do resto do painel (`bg-gray-950`/`900`,
`border-gray-800`). Dois cards clicáveis (link, não botão):

- **Equipe**: ícone/label simples, subtítulo "Gerenciar administradores e
  equipe da plataforma", `href="/plataforma/configuracoes/equipe"`. Visível
  só se `isMasterAdmin(role)` (equipe não vê o card nem a página).
- **Integrações**: subtítulo "Provedores externos conectados ao Tibé",
  `href="/plataforma/configuracoes/integracoes"`. Mesma regra de
  visibilidade.

Se `equipe` acessar `/plataforma/configuracoes` diretamente pela URL: a
página redireciona para `/plataforma/tenants` (mesmo padrão das duas
sub-páginas: página inteira é master_admin-only, não só os cards).

### `/plataforma/configuracoes/integracoes` (server component)

Um card: **WhatsApp**, subtítulo "Evolution API ou Meta Cloud API",
`href="/plataforma/configuracoes/whatsapp"`. Mesma regra de acesso
(master_admin only, redirect se não).

### Sidebar (`app/plataforma/(painel)/layout.tsx`)

Remove os links diretos de "Equipe" e "WhatsApp". Adiciona um link
**Configurações** (`href="/plataforma/configuracoes"`), visível só pra
master_admin (mesma condição `{masterAdmin && (...)}` que já envolve os
links atuais: `equipe` não via Equipe/WhatsApp antes, e não vê
Configurações agora; ela mantém acesso só a Tenants).

## Fora do escopo

- Não muda nada dentro das páginas de Equipe ou WhatsApp: só a navegação até
  elas.
- Não adiciona breadcrumb (fica para depois se for pedido).
