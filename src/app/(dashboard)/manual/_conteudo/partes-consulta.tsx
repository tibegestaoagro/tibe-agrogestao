import Link from "next/link";
import { BASE_DO_EMPORIO } from "./indice";

const TERMOS: { termo: string; significa: React.ReactNode }[] = [
  { termo: "Lacrado e avulso", significa: "Lacrado é a embalagem fechada, como a saca inteira. Avulso é o que está solto, como o quilo que sobrou de uma saca aberta. O saldo do produto é a soma dos dois." },
  { termo: "Apresentação", significa: "Cada jeito de vender o mesmo produto: a saca fechada, o quilo a granel, o fardo. Cada apresentação tem o seu preço." },
  { termo: "Unidade-base e conteúdo", significa: "A unidade-base é como o estoque é contado: saca, fardo, quilo, litro ou unidade. O conteúdo diz quanto cabe em uma saca ou fardo, por exemplo 30 kg." },
  { termo: "Custo médio", significa: "O custo de cada produto na loja, calculado a cada compra, levando em conta o que você pagou antes e o que pagou agora. É com ele que o sistema calcula a margem de cada venda." },
  { termo: "Custo provisório", significa: "Aparece quando a venda foi feita sem a compra lançada (com o estoque negativo liberado). O sistema usa o último custo médio. Quando a compra entra, a venda antiga não muda." },
  { termo: "Resultado estimado", significa: "Um resultado que depende de custo provisório, custo que falta ou despesa fixa ainda não paga. Ele é uma aproximação, e o selo Estimado avisa isso." },
  { termo: "Vendeu, Pagou", significa: "Despesa que nasce junto com a venda, como comissão, entrega ou embalagem. Ela entra na margem na hora da venda, mas o dinheiro só sai quando você paga." },
  { termo: "Ponto de equilíbrio", significa: "Quanto a loja precisa vender no mês para cobrir as despesas fixas. A tela também diz quanto falta." },
  { termo: "Em trânsito", significa: "Transferência que já saiu da loja de origem e ainda não foi confirmada no destino. A mercadoria não está em nenhuma das duas lojas." },
  { termo: "Aguardando o Gestor", significa: "Transferência que chegou a menos. Nada entra no destino até o Gestor do destino, o Dono ou o Gerente geral resolverem, com um motivo." },
  { termo: "Só da loja", significa: "Quem vê apenas o Meu Empório e o necessário, sem a fazenda e sem o Financeiro. Gestor e Vendedor são sempre assim." },
  { termo: "Gaveta", significa: "O dinheiro físico da loja. O sistema calcula quanto deveria ter, e você confere contando." },
  { termo: "Chave", significa: "Uma permissão extra do Vendedor, que vem desligada. O Dono liga na Equipe." },
];

export function ParteDeGlossario() {
  return (
    <dl className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
      {TERMOS.map((t) => (
        <div key={t.termo} className="p-4">
          <dt className="font-semibold text-texto">{t.termo}</dt>
          <dd className="mt-1 text-texto-secundario">{t.significa}</dd>
        </div>
      ))}
    </dl>
  );
}

const PERGUNTAS: { pergunta: string; resposta: React.ReactNode }[] = [
  {
    pergunta: "Por que a venda de saca fechada foi recusada?",
    resposta: "Porque não há saca lacrada no estoque. O sistema não deixa vender uma embalagem fechada que não existe. Faça a contagem do estoque, lance a compra que faltou, ou venda a granel.",
  },
  {
    pergunta: "Por que 1 kg de uma saca de 30 kg não pode ser granel?",
    resposta: "1 kg de 30 kg dá 0,0333 saca, e o sistema guarda só três casas depois da vírgula. Ficaria uma fração fantasma. Use uma medida que feche, como 3 kg (0,1 saca) ou 1,5 kg (0,05 saca). Em saca de 10 kg, 1 kg funciona.",
  },
  {
    pergunta: "Por que o Vendedor não vê o Financeiro?",
    resposta: "Quem é só da loja vê apenas o Meu Empório e o necessário. Dinheiro da conta, despesas e resultado são de quem responde pela loja: o Gestor, o Gerente geral e o Dono.",
  },
  {
    pergunta: "O que acontece quando a transferência chega a menos?",
    resposta: "Ela fica aguardando o Gestor, e nada entra no estoque do destino. O Gestor do destino, o Dono ou o Gerente geral escolhem: perda no caminho, não foi enviada ou conferir depois. O motivo é obrigatório.",
  },
  {
    pergunta: "E se chegar mais do que foi enviado?",
    resposta: "O sistema recusa. Aceitar sobra esconderia um erro de envio. Confira a quantidade com a outra loja.",
  },
  {
    pergunta: "Por que a venda ficou com custo provisório?",
    resposta: "O produto foi vendido sem a compra lançada, com o estoque negativo liberado. O sistema usa o último custo médio como estimativa. Quando a compra entrar, a venda antiga não muda, e o resultado dela fica marcado como estimado.",
  },
  {
    pergunta: "Como dar mais permissão ao Vendedor?",
    resposta: <>Na <Link className="underline" href={`${BASE_DO_EMPORIO}/equipe`}>Equipe</Link>, o Dono ou o Gerente geral ligam as chaves dele: devolver e trocar, lançar compra, contagem, perda, estoque inicial, produção, levar a gaveta ao banco, depositar cheque e cadastrar produto. Cancelar venda, mudar preço e dar desconto acima do limite não têm chave: se precisa disso, promova a Gestor.</>,
  },
  {
    pergunta: "Por que o PIX foi recusado?",
    resposta: "A loja não tem uma conta bancária escolhida para receber PIX. O Dono ou o Gestor cadastram a conta e escolhem na loja.",
  },
  {
    pergunta: "Por que o cartão foi recusado?",
    resposta: "Falta a regra daquela forma de cartão (débito, crédito à vista ou parcelado) na loja, com a taxa e o prazo. Sem ela, a margem sairia errada. O Gestor cadastra a regra.",
  },
  {
    pergunta: "Por que não consigo vender fiado?",
    resposta: "Fiado precisa de cliente cadastrado, porque sem nome ninguém sabe quem deve. Escolha o cliente ou use o cadastro rápido na própria venda.",
  },
  {
    pergunta: "Por que o desconto foi recusado?",
    resposta: "Passou do limite de desconto da loja. Acima dele, só o Gestor, o Gerente geral ou o Dono podem dar, e o sistema grava quem deu.",
  },
  {
    pergunta: "Por que não consigo cancelar uma venda?",
    resposta: "Cancelar é do Gestor e do Dono. E, se a venda teve cheque que já foi depositado ou compensado, o cancelamento é recusado até você resolver o cheque. Uma devolução parcial continua possível.",
  },
  {
    pergunta: "O preço mudou sozinho depois que o custo subiu?",
    resposta: "Nunca. O preço cadastrado só muda quando você aplica. A tela mostra o novo sugerido e deixa você decidir.",
  },
  {
    pergunta: "Por que o resultado da loja está marcado como estimado?",
    resposta: "Algum custo está provisório ou falta, ou uma despesa fixa ainda não foi paga. Lance a compra ou o custo que falta, e o selo sai.",
  },
  {
    pergunta: "Por que o Meu Dia me avisa da gaveta?",
    resposta: "Algum dia dos últimos sete teve movimento na gaveta e ninguém conferiu. Faça a conferência com o que está nela. O dia de hoje não conta, porque ainda não acabou.",
  },
];

export function ParteDePerguntas() {
  return (
    <div className="space-y-2">
      {PERGUNTAS.map((p) => (
        <details key={p.pergunta} className="group rounded-lg border border-borda bg-superficie print:break-inside-avoid">
          <summary className="cursor-pointer px-4 py-3 font-medium text-texto">{p.pergunta}</summary>
          <div className="border-t border-borda px-4 py-3 text-texto-secundario">{p.resposta}</div>
        </details>
      ))}
    </div>
  );
}
