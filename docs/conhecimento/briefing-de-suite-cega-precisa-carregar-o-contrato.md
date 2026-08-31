---
tipo: licao
data: 2026-08-31
tags: [processo, ondas, time-de-agentes, teste]
origem: 61f6196
---

# Briefing de suíte cega precisa carregar o contrato, ou a cegueira vira adivinhação

## O que aconteceu

O padrão do time é que quem escreve a suíte **não lê a implementação**: recebe
a spec e o contrato, e escreve em paralelo a quem implementa. Isso funciona, e
já achou defeito real duas vezes.

Mas aconteceu **duas vezes na mesma sessão** de o briefing não carregar o
contrato completo:

1. No piloto, o briefing não deu os nomes exportados nem os caminhos de rota. O
   agente resolveu indo ler as **suítes irmãs** (`m47`, `m37`), que são
   contrato estável e não solução em andamento, e deduziu corretamente que o
   fluxo reusava funções existentes.
2. No Confinamento, o briefing não deu as assinaturas dos cinco exports novos
   nem os campos das sete rotas. Sem elas era impossível chamar as funções, e o
   agente leu `confinement.ts` **para extrair contrato**, explicitamente não
   para copiar lógica, e registrou isso como achado de processo.

Nos dois casos o agente agiu bem. Nos dois, a falha foi do briefing, ou seja,
minha.

## Por que importa

A regra "não leia a solução" **pressupõe** que o briefing carregue o contrato.
Quando ele não carrega, o agente fica entre duas coisas ruins: quebrar a
cegueira, ou adivinhar assinatura e escrever uma suíte que não compila.

Pior: o segundo caso é silencioso. Uma suíte escrita por adivinhação pode até
compilar, testando o que o agente **imaginou** que a função faz.

## Como aplicar

**O briefing de suíte cega precisa trazer, sempre:**

- nomes exportados e assinaturas das funções a testar;
- caminhos de rota e o formato de request e response;
- nomes de campo na API, e os códigos de erro esperados, com o `field` de cada;
- onde vive cada número que a spec cita (o §25 pede "quatro números": em qual
  função eles são calculados?).

**A pergunta que gera essa lista:** *o que este agente precisa saber para
chamar a função, sem nunca abrir o arquivo dela?*

Se a resposta demorar a sair, o contrato não existe ainda, e isso é achado: uma
implementação sem contrato explícito também não tem como ser revisada.

⚠️ Ler **suíte irmã** é legítimo e não quebra a cegueira: ela é contrato
estável, e não a solução em andamento. Foi a saída certa no primeiro caso.

## Relacionado

- [[suite-cega-cobra-mais-do-que-o-briefing-mandou]]
- [[contrato-incompleto-diverge-entre-agentes-paralelos]]
- [[escrever-a-licao-nao-impede-repeti-la]]
