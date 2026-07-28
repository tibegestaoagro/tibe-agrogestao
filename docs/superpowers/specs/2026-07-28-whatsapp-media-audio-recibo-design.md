# Suporte a mídia no agente WhatsApp: áudio e foto/PDF de nota

Data: 2026-07-28
Status: aprovado, pronto para implementação

## Contexto

O agente WhatsApp do Tibé (Módulo 3 + M7) hoje só entende texto. O usuário
pediu duas extensões, priorizadas nesta ordem:

1. **Áudio**: transcrever a mensagem de voz e tratar como texto normal no
   fluxo de classificação de intenção já existente.
2. **Foto/PDF de nota fiscal ou recibo**: extrair valor, categoria e
   fornecedor de uma compra ou serviço contratado, e ajudar o usuário a
   lançar isso no financeiro sem digitar tudo manualmente.

Uma terceira ideia (foto de animal/produção para comparação futura) foi
levantada mas está **fora de escopo** — o usuário ainda vai validar com o
cliente (Da Mata/Agromax) antes de especificar isso.

## Decisão de arquitetura

Toda chamada a modelo de IA (classificação de texto, transcrição de áudio,
visão de imagem/PDF) continua acontecendo **só no N8N**, nunca no Tibé — é a
mesma regra já em vigor hoje ("a chave de API do provedor de LLM fica nas
credenciais do N8N, não no `.env` do Tibé", CLAUDE.md). O Tibé nunca recebe
mídia bruta nem chama a OpenAI diretamente; ele só recebe intenção +
parâmetros já estruturados via `POST /api/internal/whatsapp/execute-action`,
exatamente como acontece hoje para mensagens de texto.

Consequência prática: **áudio não precisa de nenhuma mudança no Tibé.**
Só o recibo precisa (uma intenção nova).

## 1. Áudio → texto

Mudança inteiramente dentro do workflow do N8N ("Normalizar e Filtrar" →
antes de "Classificar Intenção"):

1. Detectar se o payload da Evolution tem `message.audioMessage` (em vez de
   `message.conversation`/`extendedTextMessage`). O áudio já chega em
   base64 no webhook (`webhookBase64: true`, já configurado).
2. Enviar o áudio para `POST https://api.openai.com/v1/audio/transcriptions`
   (Whisper), usando a credencial "OpenAI API Key" já existente no N8N.
3. Pegar o texto transcrito e injetá-lo no mesmo caminho que uma mensagem de
   texto normal seguiria — cai direto em "Classificar Intenção" e segue
   idêntico daí em diante (permissão, confirmação, resposta).
4. Falha na transcrição (API fora do ar, áudio corrompido): responder
   direto, sem acionar o Tibé, algo como "Não consegui entender o áudio,
   pode tentar de novo ou digitar sua mensagem?".

Nenhum teste novo do lado Tibé é necessário para esta parte — o Tibé nunca
sabe se o texto veio de voz ou de digitação.

## 2. Foto/PDF de recibo → lançamento financeiro

### N8N (extração)

Novo ramo em "Normalizar e Filtrar": se a mensagem tiver `imageMessage` ou
`documentMessage` com mimetype `application/pdf`, desviar para um ramo de
extração antes de "Classificar Intenção":

1. PDF: renderizar a primeira página como imagem antes de enviar (detalhe
   de implementação a decidir na hora — ex: node de conversão, ou usar
   input de arquivo da própria API da OpenAI se suportar PDF direto).
2. Enviar a imagem para um modelo com visão (GPT-4o ou GPT-4o-mini — testar
   qualidade de leitura em cupom fiscal/nota antes de decidir qual),
   pedindo extração estruturada em JSON:
   ```json
   { "amount": number | null, "category": string | null, "vendor": string | null, "description": string | null }
   ```
   O prompt deve instruir o modelo a escolher `category` **só entre as
   opções fixas do produto** (`Ração, Combustível, Mão de obra, Manutenção,
   Insumos, Veterinário, Outros` — mesma lista de
   `src/lib/category-suggestions.ts`), nunca inventar uma categoria livre.
3. Se `amount` vier `null` (não deu pra ler o valor com confiança): **não
   aciona o Tibé**. Responde direto pedindo uma foto mais nítida ou pra
   digitar o lançamento manualmente. Isso evita ter que inventar um
   mecanismo de "esperar resposta de um campo faltando", que o sistema não
   tem hoje (o único estado entre mensagens que existe é o par
   pergunta-de-confirmação → "sim"/"não").
4. Se `amount` veio ok: dispara a intenção nova (abaixo) pro
   `execute-action`, com `message_text` vazio/nulo (não houve texto
   digitado) e os parâmetros extraídos.

### Tibé (execução)

**Nova intenção**: `registrar_lancamento_financeiro`, adicionada a
`src/lib/whatsapp-intents.ts`:
- `INTENTS`: `+ "registrar_lancamento_financeiro"`
- `INTENT_ACCESS`: `{ module: "financeiro", action: "write" }` (sem
  `profile` — financeiro está disponível pros dois perfis, igual
  `consultar_saldo` hoje)

**Novo handler** em `src/lib/actions/whatsapp-router.ts`, no mesmo padrão
de `registrar_movimento`/`cadastrar_servico_ordem` (campo `confirmed` /
`explicitNo` já genéricos no roteador — nenhuma mudança na assinatura de
`routeIntent` nem no contrato HTTP de `execute-action`):

- Parâmetros esperados: `amount` (number, obrigatório), `category` (string,
  obrigatório — se vier fora da lista fixa, cai em `"Outros"`), `vendor`
  (string, opcional, vai pro campo `notes`), `description` (string,
  opcional, também compõe `notes`).
- **Sempre** pede confirmação, independente do valor (decisão do usuário:
  leitura de imagem erra mais que digitação manual, então todo valor exige
  o mesmo cuidado — não reusa `CONFIRMATION_THRESHOLD`, que é só pra
  venda/compra de animal e ordem de serviço).
  - `explicitNo` → `"Lançamento cancelado."`, sem gravar nada.
  - `!confirmed` → responde um resumo e pede "sim": `` `Entendi: R$
    {amount}, categoria {category}{vendor ? `, ${vendor}` : ""}. Confirma o
    lançamento?` ``, com `auxiliary_data: { amount, category, vendor,
    description }` e `requires_confirmation: true`.
  - `confirmed` → chama `createManualEntryAction(db, { entry_type:
    "expense", category, amount, due_date: new Date(), notes: vendor ??
    description ?? null })` (mesma action que `POST
    /api/v1/financial-entries` já usa — nasce `related_module: geral`,
    editável depois pelo painel, igual qualquer lançamento manual).
  - Resposta de sucesso: `` `Lançamento registrado: R$ {amount},
    {category}${vendor ? `, ${vendor}` : ""}.` ``

Escopo: só despesa (`entry_type: "expense"`) — compra ou serviço
contratado, como pedido. Não cobre "recebi um pagamento" (receita).

## Testes

- `scripts/m3-whatsapp.test.ts` (ou um teste M11 novo, a decidir na hora
  seguindo a convenção `test:mN`): cobrir `registrar_lancamento_financeiro`
  direto no `routeIntent`/`execute-action` — fluxo completo (pedir
  confirmação → confirmar → `FinancialEntry` criado com os dados certos),
  `explicitNo` cancela sem gravar, categoria fora da lista fixa cai em
  "Outros", isolamento entre tenants.
- Áudio não tem teste automatizado do lado Tibé (mudança é só N8N); a
  verificação é manual, mandando um áudio de teste pro número real depois
  do workflow publicado.

## Fora de escopo (não implementar agora)

- Foto de animal/produção para comparação futura (pendente validação com o
  cliente).
- Receita via foto (só despesa).
- Qualquer estado de conversa multi-turno novo além do par
  confirmação/sim-não que já existe.
