import { BotaoImprimir } from "../../_components/botao-imprimir";

export const metadata = { title: "Guia do Vendedor | Manual" };

const BLOCOS: { titulo: string; passos: string[] }[] = [
  {
    titulo: "Vender",
    passos: [
      "Abra Vender no menu e confira a loja.",
      "Busque o produto por nome, marca ou código e toque nele.",
      "Confira a quantidade e o preço.",
      "Escolha o Cliente. Quem não quer se identificar é o Consumidor final.",
      "Escolha a forma de pagamento: Dinheiro, PIX, Débito, Crédito, Parcelado ou Cheque. Em duas formas, some até fechar o total.",
      "Confira o Vendedor: vem com o seu nome. Se um colega atendeu, escolha ele.",
      "Clique em Fechar a venda.",
    ],
  },
  {
    titulo: "Imprimir",
    passos: [
      "Depois da venda, clique em Imprimir A4 (folha) ou Imprimir cupom (bobina).",
      "Na aba que abre, clique em Imprimir. Para PDF, escolha Salvar como PDF.",
      "Para imprimir de novo, abra a venda em Vendas.",
    ],
  },
  {
    titulo: "Orçamento",
    passos: [
      "Em Vender, toque em Orçamento, no alto.",
      "Monte os itens como numa venda.",
      "Escolha o cliente com nome, CPF ou CNPJ e telefone.",
      "Clique em Salvar orçamento e imprima.",
      "Cliente voltou: em Venda, digite o número em Orçamento nº e clique em Carregar.",
    ],
  },
  {
    titulo: "Fiado",
    passos: [
      "Escolha o cliente de verdade. O Consumidor final não compra fiado.",
      "Toque em + Fiado para o que falta e feche a venda.",
      "Quando ele voltar, abra Fiado, ache o nome e clique em Receber.",
    ],
  },
  {
    titulo: "Abrir, conferir e encerrar o caixa",
    passos: [
      "Abra Caixa e clique em Abrir, na linha do caixa. Conte o troco e digite em Troco contado.",
      "Caixa fechado na hora da venda? Clique em Abrir o Caixa 1 ali mesmo. A venda continua.",
      "Para conferir, clique em Conferir e digite o valor contado. Se não bater, escreva o motivo.",
      "No fim do turno, clique em Encerrar: conte, informe o malote e deixe o troco. Imprima o relatório e leve com o malote.",
    ],
  },
  {
    titulo: "Sangria",
    passos: [
      "Muito dinheiro no caixa? Em Caixa, clique em Sangria.",
      "Digite o valor retirado e clique em Registrar sangria.",
      "Leve as notas ao gerente. Ele confirma o que recebeu.",
    ],
  },
  {
    titulo: "Receber mercadoria",
    passos: [
      "Compra: abra Compras, ache a compra Pendente e clique em Receber.",
      "Transferência: abra Transferências, ache a Em trânsito e digite o que chegou, item por item.",
      "Chegou menos? Digite o que chegou de verdade. O Gestor resolve.",
    ],
  },
];

const RECUSAS: [string, string][] = [
  ["Saca fechada recusada", "Não há saca lacrada no estoque. Venda a granel ou chame o Gestor."],
  ["PIX ou cartão recusado", "Falta cadastrar a conta ou a regra na loja. Chame o Gestor."],
  ["Desconto recusado", "Passou do limite. Chame o Gestor."],
  ["Fiado ou cheque recusado", "O Consumidor final não compra fiado nem paga em cheque. Escolha o cliente ou clique em Cliente novo."],
  ["Nenhum caixa aberto", "Clique em Abrir o Caixa 1, conte o troco e abra. A venda continua."],
  ["Escolha o vendedor que atendeu", "No campo Vendedor, escolha quem atendeu o cliente."],
  ["Orçamento recusado", "Escolha um cliente de verdade, com CPF ou CNPJ e telefone. Se aparecer Cadastro incompleto, clique em Completar cadastro."],
  ["Botão que não aparece", "Essa permissão está desligada para você. Peça ao Dono."],
];

/** Uma folha A4. O que não é do guia (menu, cabeçalho, índice) some na impressão. */
export default function GuiaDoVendedorPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 print:max-w-none print:space-y-2 print:text-[11px] print:leading-tight">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto print:text-lg">Guia do Vendedor</h1>
          <p className="text-sm text-texto-secundario print:text-[11px]">O essencial do balcão, em uma folha.</p>
        </div>
        <BotaoImprimir />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
        {BLOCOS.map((b) => (
          <section key={b.titulo} className="rounded-lg border border-borda bg-superficie p-4 print:break-inside-avoid print:p-2">
            <h2 className="font-semibold text-texto">{b.titulo}</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-texto print:mt-1 print:space-y-0 print:text-[11px]">
              {b.passos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-borda bg-superficie p-4 print:break-inside-avoid print:p-2">
        <h2 className="font-semibold text-texto">Quando o sistema recusa</h2>
        <p className="text-sm text-texto-secundario print:text-[11px]">
          A frase vermelha embaixo do campo diz o que mudar. Se não resolver:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-texto print:mt-1 print:space-y-0 print:text-[11px]">
          {RECUSAS.map(([quando, fazer]) => (
            <li key={quando}>
              <strong className="font-medium">{quando}:</strong> {fazer}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
