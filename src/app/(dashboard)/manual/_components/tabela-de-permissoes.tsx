import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Celula = "sim" | "nao" | "chave";

const LINHAS: { acao: string; dono: Celula; gestor: Celula; vendedor: Celula }[] = [
  { acao: "Vender no balcão (desconto até o limite da loja)", dono: "sim", gestor: "sim", vendedor: "sim" },
  { acao: "Receber fiado e conferir a gaveta", dono: "sim", gestor: "sim", vendedor: "sim" },
  { acao: "Receber compra e receber transferência que chegou certa", dono: "sim", gestor: "sim", vendedor: "sim" },
  { acao: "Ver estoque, vendas e caixa da própria loja", dono: "sim", gestor: "sim", vendedor: "sim" },
  { acao: "Devolver e trocar", dono: "sim", gestor: "sim", vendedor: "chave" },
  { acao: "Lançar compra", dono: "sim", gestor: "sim", vendedor: "chave" },
  { acao: "Contagem de estoque, perda e estoque inicial", dono: "sim", gestor: "sim", vendedor: "chave" },
  { acao: "Registrar produção", dono: "sim", gestor: "sim", vendedor: "chave" },
  { acao: "Levar a gaveta ao banco e depositar cheque", dono: "sim", gestor: "sim", vendedor: "chave" },
  { acao: "Cadastrar e editar produto", dono: "sim", gestor: "sim", vendedor: "chave" },
  { acao: "Mudar preço, mínimo e máximo", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Dar desconto acima do limite", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Cancelar venda", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Regras de cartão, PIX e dados da loja", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Despesas, Vendeu Pagou e contas a pagar", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Resultado da loja e Histórico", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Enviar transferência (da própria loja)", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Resolver transferência que chegou a menos", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Ver o estoque das outras lojas (só para olhar)", dono: "sim", gestor: "sim", vendedor: "nao" },
  { acao: "Liberar estoque negativo", dono: "sim", gestor: "nao", vendedor: "nao" },
  { acao: "Criar e arquivar loja, contas bancárias, composição e percentuais do produto", dono: "sim", gestor: "nao", vendedor: "nao" },
  { acao: "Ver Todas as lojas somadas e usar a Equipe", dono: "sim", gestor: "nao", vendedor: "nao" },
];

const TEXTO: Record<Celula, string> = { sim: "Pode", nao: "Não pode", chave: "Só se o Dono ligar" };
const COR: Record<Celula, string> = {
  sim: "text-sucesso-tinta",
  nao: "text-texto-discreto",
  chave: "text-atencao-tinta",
};

/**
 * A tabela de permissões em palavras de balcão (Q127 e Q129). "Dono" vale também
 * para o Gerente geral, que faz tudo o que o Dono faz, menos criar ou alterar o
 * próprio Dono.
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {LINHAS.map((l) => (
          <TableRow key={l.acao}>
            <TableCell>{l.acao}</TableCell>
            {[l.dono, l.gestor, l.vendedor].map((c, i) => (
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
