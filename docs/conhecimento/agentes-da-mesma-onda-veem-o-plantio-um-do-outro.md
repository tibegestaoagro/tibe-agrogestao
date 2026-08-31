---
tipo: armadilha
data: 2026-08-31
tags: [ondas, time-de-agentes, processo, teste]
origem: 3a286ce
---

# Agentes da mesma onda enxergam o working tree um do outro, plantio incluído

## O que aconteceu

Numa onda com duas tarefas em arquivos disjuntos, a primeira rodou
`npm run check` e reportou **uma falha num arquivo fora do escopo dela**. A
conclusão natural, e errada, foi regressão causada pela outra tarefa.

Não era. A segunda tarefa estava provando uma trava nos dois sentidos, e para
isso **planta um defeito de propósito**, roda, vê reprovar, e remove. A
primeira rodou o `check` exatamente nessa janela e viu o plantio.

## Por que importa

A regra de formação de onda protege contra **colisão de arquivo** e contra
**corrida de commit**. Ela não protege contra **estado de verificação
compartilhado**: `npm run check`, `tsc` e as suítes leem o repositório inteiro,
não só os arquivos da tarefa.

O sintoma é caro porque parece regressão real: um arquivo limpo passa a
reprovar, e quem vê não tem como saber que é transitório. O custo é uma
investigação inteira, e no pior caso um "conserto" de algo que não estava
quebrado.

## Como aplicar

- **Falha de conferência em arquivo fora do escopo, durante uma onda, é
  suspeita de plantio antes de ser suspeita de regressão.** Confirme com o
  estado parado, depois que a onda inteira fechar, antes de investigar.
- A conferência que vale é a que a **sessão principal** roda com todos os
  agentes terminados. A dos agentes serve para eles, não para o veredito.
- Quem for provar trava nos dois sentidos deve dizer no relatório **que
  plantou e removeu**, para o vizinho não ser acusado.
- Se a janela incomodar de verdade, a saída é worktree por agente, que o
  protocolo já reserva como último recurso pelo custo que tem.

## Relacionado

- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[contrato-incompleto-diverge-entre-agentes-paralelos]]
