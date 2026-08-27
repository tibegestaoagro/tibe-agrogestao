# Backup do `.env`, cifrado

O `.env` deste projeto tem 22 variáveis, e entre elas estão a `DATABASE_URL` de
produção, os dois segredos de sessão (tenant e plataforma) e a
`CONFIG_ENCRYPTION_KEY`, que decifra as credenciais de WhatsApp guardadas no
banco. Em texto puro, esse arquivo é o chaveiro inteiro do sistema.

Por isso ele **nunca** entra no repositório, nem em texto puro nem cifrado.
Segredo commitado não se apaga depois: reescrever a história não alcança os
clones já feitos, e a única limpeza real é rotacionar as 22 credenciais.

**O backup existe, e mora fora do git:** o `.env.enc` fica no PC de trabalho, e
a senha, no gerenciador de senhas. Nunca em arquivo solto na máquina, nunca
aqui.

## Restaurar num computador novo

O `.env.enc` **não vem mais junto com o clone**, então leve o arquivo por fora
(pen drive, anexo no gerenciador de senhas, o que for), coloque na raiz do
projeto e decifre:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in .env.enc -out .env
```

O `openssl` pergunta a senha. Ele já vem no Git Bash, no macOS e no Linux.

Se o arquivo não estiver à mão, use o caminho alternativo mais abaixo: a Vercel
devolve 15 das 22 variáveis sozinha.

## Regravar o backup depois de mudar o `.env`

```bash
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -in .env -out .env.enc
```

Depois de gerar, **confira a volta antes de guardar**. Backup que não se prova
não é backup:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in .env.enc -out /tmp/conf
diff .env /tmp/conf && echo "identico" && rm /tmp/conf
```

## O caminho alternativo, se a senha se perder

**15 das 22 variáveis estão na Vercel** e voltam sozinhas:

```bash
npx vercel env pull .env
```

As sete que faltam são todas de desenvolvimento, e não afetam produção:
`OPENAI_API_KEY`, `N8N_API_KEY`, `URL_N8N`, `N8N_WEBHOOK_SECRET`, `ASAAS_ENV`,
`ASAAS_WEBHOOK_TOKEN` e `WA_TEST_PHONE`. As do n8n saem do painel do n8n; a da
OpenAI, do painel da OpenAI; o `WA_TEST_PHONE` é o telefone do banco de provas.

Ou seja: perder a senha atrasa, não perde o projeto.

## Os outros arquivos de ambiente

- `apps/mobile/.env`: uma variável só, `EXPO_PUBLIC_API_BASE_URL`. Não é
  segredo por desenho (o prefixo `EXPO_PUBLIC_` embute o valor no bundle), e o
  `.env.example` ao lado dela já documenta os valores por ambiente.
- `.env.local`: só o `VERCEL_OIDC_TOKEN`, de vida curta, regerado pela CLI da
  Vercel. Não precisa de backup.
