import { BotaoImprimir } from "../../_components/botao-imprimir";

export const metadata = { title: "Guia do Vendedor | Manual" };

const BLOCOS: { titulo: string; passos: string[] }[] = [
  {
    titulo: "Vender",
    passos: [
      "Abra Vender no menu.",
      "Busque o produto por nome, marca ou código e toque nele.",
      "Confira a quantidade e o preço.",
      "Escolha a forma de pagamento: dinheiro, PIX, débito, crédito, parcelado ou cheque.",
      "Se o cliente paga em duas formas, some até fechar o total.",
      "Conclua a venda.",
    ],
  },
  {
    titulo: "Fiado",
    passos: [
      "Escolha o cliente antes. Sem cliente não há fiado.",
      "Deixe o que falta como fiado e conclua.",
      "Quando ele voltar, abra Fiado, ache o nome e clique em Receber.",
    ],
  },
  {
    titulo: "Conferir a gaveta (todo fim de dia)",
    passos: [
      "Abra Caixa e clique em Conferir gaveta.",
      "Conte o dinheiro e digite o valor contado.",
      "Se não bater, escreva o motivo da diferença.",
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
  ["Fiado recusado", "Falta o cliente. Escolha ou cadastre na hora."],
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
