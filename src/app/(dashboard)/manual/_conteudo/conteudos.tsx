import type { ReactNode } from "react";
import { ParteDono, ParteGestor, ParteVendedor } from "./partes-funcao";
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
  ParteDeDespesas,
  ParteDeDevolver,
  ParteDeFiado,
  ParteDeHistorico,
  ParteDeResultado,
  ParteDeVender,
} from "./partes-tarefa-2";
import { ParteDeGlossario, ParteDePerguntas } from "./partes-consulta";

/** O texto de cada parte, pelo `slug` de `indice.ts`. */
export const CONTEUDOS: Record<string, () => ReactNode> = {
  dono: ParteDono,
  gestor: ParteGestor,
  vendedor: ParteVendedor,
  "primeiros-passos": ParteDePrimeirosPassos,
  equipe: ParteDeEquipe,
  produtos: ParteDeProdutos,
  preco: ParteDePreco,
  compras: ParteDeCompras,
  estoque: ParteDeEstoque,
  transferencias: ParteDeTransferencias,
  vender: ParteDeVender,
  devolver: ParteDeDevolver,
  fiado: ParteDeFiado,
  caixa: ParteDeCaixa,
  despesas: ParteDeDespesas,
  resultado: ParteDeResultado,
  historico: ParteDeHistorico,
  glossario: ParteDeGlossario,
  perguntas: ParteDePerguntas,
};
