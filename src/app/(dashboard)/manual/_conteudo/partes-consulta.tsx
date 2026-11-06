import Link from "next/link";
import { BASE_DO_EMPORIO } from "./indice";

const TERMOS: { termo: string; significa: React.ReactNode }[] = [
  { termo: "Lacrado e avulso", significa: "Lacrado é a embalagem fechada, como a saca inteira. Avulso é o que está solto, como o quilo que sobrou de uma saca aberta. O saldo do produto é a soma dos dois." },
  { termo: "Apresentação", significa: "Cada jeito de vender o mesmo produto: a saca fechada, o quilo a granel, o fardo. Cada apresentação tem o seu preço." },
  { termo: "Unidade-base e conteúdo", significa: "A unidade-base é como o estoque é contado: saca, fardo, quilo, litro, metro ou unidade. O conteúdo diz quanto cabe em uma saca ou fardo, por exemplo 30 kg." },
  { termo: "Custo médio", significa: "O custo de cada produto na loja, calculado a cada compra, levando em conta o que você pagou antes e o que pagou agora. É com ele que o sistema calcula a margem de cada venda." },
  { termo: "Custo provisório", significa: "Aparece quando a venda foi feita sem a compra lançada (com o estoque negativo liberado). O sistema usa o último custo médio. Quando a compra entra, a venda antiga não muda." },
  { termo: "Resultado estimado", significa: "Um resultado que depende de custo provisório, custo que falta ou despesa fixa ainda não paga. Ele é uma aproximação, e o aviso “Este resultado é uma estimativa” diz o motivo." },
  { termo: "Vendeu, Pagou", significa: "Despesa que nasce junto com a venda, como comissão, entrega ou embalagem. Ela entra na margem na hora da venda, mas o dinheiro só sai quando você paga." },
  { termo: "Ponto de equilíbrio", significa: "Quanto a loja precisa vender no mês para cobrir as despesas fixas. A tela também diz quanto falta." },
  { termo: "Em trânsito", significa: "Transferência que já saiu da loja de origem e ainda não foi confirmada no destino. A mercadoria não está em nenhuma das duas lojas." },
  { termo: "Aguardando o Gestor", significa: "Transferência que chegou a menos. Nada entra no destino até o Gestor do destino, o Dono ou o Gerente geral resolverem, com um motivo." },
  { termo: "Só da loja", significa: "Quem vê apenas o Meu Empório e o necessário, sem a fazenda e sem o Financeiro. Gestor, Vendedor e Caixa são sempre assim. O Gerente geral fica assim quando o Dono liga o Acesso dele na Equipe." },
  { termo: "Caixa (o lugar)", significa: "Uma gaveta de dinheiro da loja, com número: Caixa 1, Caixa 2. Toda loja nasce com o Caixa 1, e o Gestor cria outros em Configurações. O saldo da loja é a soma dos caixas dela." },
  { termo: "Caixa (a função)", significa: "A pessoa da Equipe que recebe o pagamento no balcão. Vende, recebe fiado, vê as vendas de hoje e opera o caixa: abre, faz sangria e encerra. Não tem chave e não abre estoque, produtos, compras, devolução nem a lista de Orçamentos. Em cada venda, escolhe o vendedor que atendeu." },
  { termo: "Gaveta", significa: "O dinheiro físico de um caixa. Cada caixa é uma gaveta. O sistema calcula quanto deveria ter, e você confere contando." },
  { termo: "Turno", significa: "O tempo entre abrir e encerrar um caixa. Cada caixa tem no máximo um turno aberto. Toda venda, fiado recebido em dinheiro, devolução em dinheiro e despesa paga da gaveta cai num turno aberto. Um turno que passa da meia-noite continua valendo, e o Meu Dia avisa." },
  { termo: "Troco inicial", significa: "O dinheiro que fica na gaveta para começar o turno. É o que o turno anterior deixou. Abrir o caixa é contar esse troco: se não bater, você escreve o motivo." },
  { termo: "Reforço", significa: "Dinheiro que sai de Com a gerência e entra no caixa na abertura, quando falta troco. É opcional. Digite o valor em Reforço da gerência (R$) e ponha o dinheiro na gaveta. Depois conte tudo e digite em Troco contado (R$): o troco do turno anterior mais o reforço." },
  { termo: "Sangria", significa: "Dinheiro tirado do caixa no meio do turno e levado ao gerente. Sai do caixa na hora e fica aguardando o gerente até ele confirmar." },
  { termo: "Malote", significa: "O dinheiro separado no encerramento para ir ao gerente, junto com o relatório do turno. O que sobra do contado fica na gaveta como troco do próximo turno." },
  { termo: "Com a gerência", significa: "O dinheiro que o gerente da loja já recebeu e confirmou. De lá ele vai ao banco pela transferência, ou volta a um caixa como reforço." },
  { termo: "Aguardando o gerente", significa: "Sangria ou malote que saiu do caixa e ainda não foi confirmado. O Gestor da loja, o Gerente geral ou o Dono confirmam o valor recebido em Caixa. Se o recebido for diferente, a diferença fica registrada." },
  { termo: "Orçamento", significa: <>Uma promessa de preço para o cliente levar no papel. Não tira do estoque, não reserva mercadoria e não recebe dinheiro. Fica aberto, vencido ou faturado. Fatura uma vez só. Veja <Link className="underline" href={`${BASE_DO_EMPORIO}/orcamento`}>Orçamento</Link>.</> },
  { termo: "Validade", significa: <>Até quando vale o preço do orçamento: até o fim do dia que aparece em Válido até. A conta começa com 7 dias, e o Dono muda em <Link className="underline" href={`${BASE_DO_EMPORIO}/configuracoes`}>Configurações</Link>. Vencido, o orçamento ainda fatura, pelo preço de hoje.</> },
  { termo: "Consumidor final", significa: "O cliente de quem não quer se identificar. Serve para venda à vista. Não compra fiado, não paga em cheque e não recebe orçamento." },
  { termo: "Vendedor da venda", significa: "Quem atendeu o cliente. Pode ser outra pessoa, diferente de quem registrou a venda. A tela da venda mostra os dois: Vendedor e, quando é outra pessoa, Registrada por. No orçamento faturado, o vendedor é o do orçamento. É ele que conta em Relatórios." },
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
    resposta: <>Na <Link className="underline" href={`${BASE_DO_EMPORIO}/equipe`}>Equipe</Link>, o Dono ou o Gerente geral ligam as chaves dele: devolver e trocar, lançar compra, contagem, perda, estoque inicial, produção, depositar cheque e cadastrar produto. Cancelar venda, mudar preço e dar desconto acima do limite não têm chave: se precisa disso, promova a Gestor.</>,
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
    pergunta: "Por que o fiado ou o cheque foi recusado com o Consumidor final?",
    resposta: <>A frase é “Fiado precisa do cliente de verdade, não do Consumidor final.” ou “Cheque precisa do cliente de verdade, não do Consumidor final.” O Consumidor final não tem nome nem documento, e ninguém saberia de quem cobrar. Escolha o cliente no campo <strong>Cliente</strong> ou clique em <strong>Cliente novo</strong>.</>,
  },
  {
    pergunta: "O sistema pede para escolher o cliente. E se ele não quiser se identificar?",
    resposta: <>Toda venda tem cliente, e a frase é “Escolha o cliente da venda.” Quem não quer se identificar entra como <strong>Consumidor final</strong>, o primeiro da lista. Para cadastrar alguém na hora, clique em <strong>Cliente novo</strong>: tipo, nome, CPF ou CNPJ e telefone são obrigatórios.</>,
  },
  {
    pergunta: "O que é o aviso “Cadastro incompleto” embaixo do cliente?",
    resposta: <>Faltam dados daquele cliente: o tipo (pessoa física ou jurídica), o CPF ou CNPJ, ou o telefone. A venda passa assim mesmo. O orçamento não passa: “Complete o cadastro do cliente (nome, documento e telefone) antes de salvar o orçamento.” Clique em <strong>Completar cadastro</strong>, preencha e clique em <strong>Salvar cadastro</strong>.</>,
  },
  {
    pergunta: "Por que a venda parou dizendo que o caixa está fechado?",
    resposta: <>Toda venda cai num caixa aberto, em qualquer forma de pagamento. A frase é “Nenhum caixa aberto nesta loja. Abra o caixa com o troco inicial para vender.” Clique em <strong>Abrir o Caixa 1</strong> (ou no caixa que aparecer), conte o troco e clique em <strong>Abrir o caixa</strong>. A venda continua com os mesmos itens. Se a loja tem mais de um caixa aberto, a frase é “Há mais de um caixa aberto. Escolha o caixa.”: escolha em qual caixa a venda cai.</>,
  },
  {
    pergunta: "Por que aparece “Escolha o vendedor que atendeu.”?",
    resposta: <>Quem tem a função Caixa registra a venda, mas não é o vendedor. Ele escolhe, a cada venda, quem atendeu o cliente, no campo <strong>Vendedor</strong>. A escolha volta vazia na venda seguinte, de propósito: o nome de um atendimento não passa para o outro. Se a frase for “Escolha um vendedor desta loja.”, a pessoa escolhida não está mais ligada a esta loja ou foi desativada. Escolha outra.</>,
  },
  {
    pergunta: "Por que o orçamento não salva?",
    resposta: "O orçamento precisa de um cliente que possa ser achado depois. A frase é “O orçamento precisa de um cliente com nome, documento e telefone.” Por isso o Consumidor final não serve. Escolha o cliente de verdade, ou cadastre na hora.",
  },
  {
    pergunta: "O orçamento venceu. Ainda dá para faturar?",
    resposta: <>Dá. Ao carregar o orçamento, a tela avisa com a data dele, por exemplo “Orçamento vencido em 28/10/2026: vale o preço de hoje.” Dentro da validade, cada item sai pelo preço orçado ou pelo de hoje, o que for menor. Quando o preço mudou, a tela mostra os dois, por exemplo “O preço mudou: orçado R$ 120,00, hoje vale R$ 110,00.”</>,
  },
  {
    pergunta: "Por que diz que o orçamento já foi faturado?",
    resposta: "Um orçamento vira venda uma vez só. A frase é “Este orçamento já foi faturado na venda nº” e o número da venda. Abra essa venda em Vendas. Se aquela venda for cancelada, o orçamento volta a ficar aberto e pode ser faturado de novo.",
  },
  {
    pergunta: "Por que o desconto foi recusado ao faturar um orçamento?",
    resposta: "O desconto que o orçamento já deu conta na venda. O limite da loja vale sobre o desconto total da venda, somando todos os itens. Por isso o desconto novo, somado ao do orçamento, não pode passar do limite. A frase é “O desconto de 12% passa do limite de 10% desta loja. Peça ao gestor da loja.”, com os números da venda. Se o Gestor autorizou um desconto maior no orçamento, ele continua valendo, desde que nenhum item do orçamento saia abaixo do preço que ele garantiu e nenhum item novo saia abaixo do preço da loja. Fora disso, só o Gestor, o Gerente geral ou o Dono passam do limite.",
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
    resposta: "Nunca. O preço cadastrado só muda quando alguém o troca. A coluna Sugerido já faz a conta com o custo novo, e você decide se muda o preço.",
  },
  {
    pergunta: "Por que o resultado da loja está marcado como estimado?",
    resposta: "Algum custo está provisório ou falta, ou uma despesa fixa ainda não foi paga. Lance a compra ou o custo que falta, e o selo sai.",
  },
  {
    pergunta: "Por que o Meu Dia me avisa do caixa?",
    resposta: "Por um de dois motivos. O primeiro aparece como “Caixa 1 da Loja Centro aberto desde 04/11”: o turno começou num dia anterior e não foi encerrado. Quem abriu ou o Gestor da loja encerra. O segundo aparece como “R$ 500,00 aguardando o gerente na Loja Centro”: uma sangria ou um malote que ninguém confirmou em Caixa. Esse aviso vai só para quem pode confirmar: o Gestor da loja, o Gerente geral e o Dono.",
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
