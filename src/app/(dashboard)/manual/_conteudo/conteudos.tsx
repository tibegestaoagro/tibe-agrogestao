import type { ReactNode } from "react";
import { ParteCaixa, ParteDono, ParteGestor, ParteVendedor } from "./partes-funcao";
import {
  ParteDeCompras,
  ParteDeEquipe,
  ParteDeEstoque,
  ParteDePreco,
  ParteDePrimeirosPassos,
  ParteDeProdutos,
  ParteDeTransferencias,
} from "./partes-tarefa-1";
import {
  ParteDeCaixa,
  ParteDeDevolver,
  ParteDeFiado,
  ParteDeHistorico,
  ParteDeVender,
} from "./partes-tarefa-2";
import {
  ParteDeClientes,
  ParteDeConfiguracoes,
  ParteDeEntrega,
  ParteDeFornecedores,
  ParteDeFranqueados,
  ParteDeOrcamento,
} from "./partes-tarefa-3";
import { ParteDeAPagar, ParteDeDinheiro, ParteDeEstatisticas } from "./partes-tarefa-4";
import { ParteDeGlossario, ParteDePerguntas } from "./partes-consulta";

/** O texto de cada parte, pelo `slug` de `indice.ts`. */
export const CONTEUDOS: Record<string, () => ReactNode> = {
  dono: ParteDono,
  gestor: ParteGestor,
  vendedor: ParteVendedor,
  "caixa-papel": ParteCaixa,
  "primeiros-passos": ParteDePrimeirosPassos,
  configuracoes: ParteDeConfiguracoes,
  equipe: ParteDeEquipe,
  produtos: ParteDeProdutos,
  preco: ParteDePreco,
  compras: ParteDeCompras,
  fornecedores: ParteDeFornecedores,
  franqueados: ParteDeFranqueados,
  estoque: ParteDeEstoque,
  transferencias: ParteDeTransferencias,
  vender: ParteDeVender,
  clientes: ParteDeClientes,
  orcamento: ParteDeOrcamento,
  entrega: ParteDeEntrega,
  devolver: ParteDeDevolver,
  fiado: ParteDeFiado,
  caixa: ParteDeCaixa,
  dinheiro: ParteDeDinheiro,
  "a-pagar": ParteDeAPagar,
  estatisticas: ParteDeEstatisticas,
  historico: ParteDeHistorico,
  glossario: ParteDeGlossario,
  perguntas: ParteDePerguntas,
};
