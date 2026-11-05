import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Celula = "sim" | "nao" | "chave";

const LINHAS: { acao: string; dono: Celula; gestor: Celula; vendedor: Celula; caixa: Celula }[] = [
  { acao: "Vender no balcão (desconto até o limite da loja)", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Escolher o vendedor da venda (o Caixa escolhe sempre)", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Cadastrar cliente e completar o cadastro no balcão", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Imprimir a venda e o orçamento (A4 ou cupom)", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Salvar orçamento e faturar orçamento pelo número", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Ver a lista de Orçamentos e buscar um orçamento", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "nao" },
  { acao: "Receber fiado", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Abrir, conferir e encerrar o caixa; fazer sangria", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Encerrar ou fazer sangria no turno que outra pessoa abriu (na loja que tem Caixa)", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Ver as vendas da própria loja (o Caixa vê só as de hoje)", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "sim" },
  { acao: "Ver o estoque da própria loja", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "nao" },
  { acao: "Receber compra e receber transferência que chegou certa", dono: "sim", gestor: "sim", vendedor: "sim", caixa: "nao" },
  { acao: "Devolver e trocar", dono: "sim", gestor: "sim", vendedor: "chave", caixa: "nao" },
  { acao: "Lançar compra", dono: "sim", gestor: "sim", vendedor: "chave", caixa: "nao" },
  { acao: "Contagem de estoque, perda e estoque inicial", dono: "sim", gestor: "sim", vendedor: "chave", caixa: "nao" },
  { acao: "Registrar produção", dono: "sim", gestor: "sim", vendedor: "chave", caixa: "nao" },
  { acao: "Depositar cheque", dono: "sim", gestor: "sim", vendedor: "chave", caixa: "nao" },
  { acao: "Cadastrar e editar produto", dono: "sim", gestor: "sim", vendedor: "chave", caixa: "nao" },
  { acao: "Confirmar a entrega de sangria e malote (Aguardando o gerente)", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Levar o dinheiro da gerência ao banco", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Mudar preço, mínimo e máximo", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Dar desconto acima do limite", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Cancelar venda", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Regras de cartão, PIX e dados da loja", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Configurações: cabeçalho da loja e Novo caixa", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Despesas, Vendeu Pagou e contas a pagar", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Resultado da loja, Relatórios e Histórico", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Enviar transferência (da própria loja)", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Resolver transferência que chegou a menos", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Ver o estoque das outras lojas (só para olhar)", dono: "sim", gestor: "sim", vendedor: "nao", caixa: "nao" },
  { acao: "Liberar estoque negativo", dono: "sim", gestor: "nao", vendedor: "nao", caixa: "nao" },
  { acao: "Configurações: impressão, validade do orçamento, rodapés e logo", dono: "sim", gestor: "nao", vendedor: "nao", caixa: "nao" },
  { acao: "Criar e arquivar loja, contas bancárias, composição e percentuais do produto", dono: "sim", gestor: "nao", vendedor: "nao", caixa: "nao" },
  { acao: "Ver Todas as lojas somadas e usar a Equipe", dono: "sim", gestor: "nao", vendedor: "nao", caixa: "nao" },
];

const TEXTO: Record<Celula, string> = { sim: "Pode", nao: "Não pode", chave: "Só se o Dono ligar" };
const COR: Record<Celula, string> = {
  sim: "text-sucesso-tinta",
  nao: "text-texto-discreto",
  chave: "text-atencao-tinta",
};

/**
 * A tabela de permissões em palavras de balcão (Q127, Q129, Q151 e Q183), o
 * espelho de `src/lib/emporio/papel.ts` e `paginas.ts`. "Dono" vale também
 * para o Gerente geral, que faz tudo o que o Dono faz, menos criar ou alterar o
 * próprio Dono. O Caixa não tem chave: o que não é dele fica fechado.
 */
export function TabelaDePermissoes() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>O que fazer</TableHead>
          <TableHead>Dono e Gerente geral</TableHead>
          <TableHead>Gestor</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>Caixa</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {LINHAS.map((l) => (
          <TableRow key={l.acao}>
            <TableCell>{l.acao}</TableCell>
            {[l.dono, l.gestor, l.vendedor, l.caixa].map((c, i) => (
              <TableCell key={i} className={`font-medium ${COR[c]}`}>
                {TEXTO[c]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
