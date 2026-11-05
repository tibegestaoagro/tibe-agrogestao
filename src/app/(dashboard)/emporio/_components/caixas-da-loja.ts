import type { CaixaRegistradoView } from "@/lib/actions/emporio-caixa";

/**
 * Os caixas de uma loja como a tela precisa deles: quem está com o turno
 * aberto vem do servidor (props ou `GET cash/registers`), nunca da sessão
 * adivinhada no navegador. Sem importar nada do servidor em runtime: só o tipo.
 */
export type CaixaDaLoja = {
  id: string;
  establishment_id: string;
  nome: string;
  /** Quem abriu o turno agora; `null` = caixa fechado. */
  aberto_por_id: string | null;
  aberto_por_nome: string | null;
  saldo: number;
};

export function paraCaixasDaLoja(views: CaixaRegistradoView[]): CaixaDaLoja[] {
  return views.map((c) => ({
    id: c.id,
    establishment_id: c.establishment_id,
    nome: c.nome,
    aberto_por_id: c.turno_aberto?.aberto_por.id ?? null,
    aberto_por_nome: c.turno_aberto?.aberto_por.name ?? null,
    saldo: c.saldo,
  }));
}

export const abertosDaLoja = (caixas: CaixaDaLoja[], lojaId: string) =>
  caixas.filter((c) => c.establishment_id === lojaId && c.aberto_por_id !== null);

export const fechadosDaLoja = (caixas: CaixaDaLoja[], lojaId: string) =>
  caixas.filter((c) => c.establishment_id === lojaId && c.aberto_por_id === null);

/**
 * O caixa que vem escolhido: o aberto pelo usuário (se mais de um, o primeiro)
 * ou o único aberto. Com vários abertos e nenhum dele, vazio: a pessoa escolhe.
 */
export function caixaInicial(abertos: CaixaDaLoja[], usuarioId: string): string {
  const meu = abertos.find((c) => c.aberto_por_id === usuarioId);
  if (meu) return meu.id;
  return abertos.length === 1 ? abertos[0].id : "";
}

export const rotuloDoCaixaAberto = (c: CaixaDaLoja) =>
  c.aberto_por_nome ? `${c.nome}, aberto por ${c.aberto_por_nome}` : c.nome;
