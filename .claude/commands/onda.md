---
description: Planeja e executa um plano em ondas paralelas, com Arquivos e Depende-de
---

Monte e execute ondas paralelas para: $ARGUMENTS

Use a skill `orquestrar-ondas`. O caminho, em resumo:

1. **Leia a spec inteira** antes de qualquer coisa, e devolva as ambiguidades.
   Onda sem spec é vários agentes adivinhando junto.
2. **Liste as tarefas**, cada uma com `Arquivos:` (caminhos exatos) e
   `Depende-de:` (IDs ou `nenhuma`). Na dúvida, depende de tudo.
3. **Escreva o contrato** que todas as tarefas compartilham: nomes de campo da
   API, mapa de tradução, códigos de erro. **Pergunte-se o que os agentes vão
   encontrar que o contrato não responde**, porque contrato incompleto produz
   saída inconsistente entre agentes paralelos.
4. **Forme as ondas**: sem dependência E sem arquivo em comum. Prove a
   disjunção mecanicamente antes de despachar, e mostre a tabela ao usuário.
5. **Despache cada onda numa ÚNICA mensagem.** É o único ponto onde existe
   paralelismo.
6. **Subagente não commita.** A sessão principal commita, uma tarefa por vez,
   na ordem, capturando o `HEAD` fresco antes de cada commit.
7. **Confira os números dos relatórios.** Já vieram errados três vezes.
8. **Última onda: `prova-juiz`**, sobre o range inteiro. Depois, validação ao
   vivo.

⚠️ Merge na `main`, push na `main` e deploy continuam exigindo autorização do
usuário a cada vez, e nenhum subagente a recebe.

⚠️ Falha de conferência em arquivo fora do escopo, durante uma onda, é suspeita
de plantio temporário de outro agente antes de ser suspeita de regressão.
Confirme com a onda parada.
