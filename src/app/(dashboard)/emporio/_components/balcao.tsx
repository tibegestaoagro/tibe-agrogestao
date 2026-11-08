"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiGet, apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { CaixaRegistradoView } from "@/lib/actions/emporio-caixa";
import type { CreditoView } from "@/lib/actions/emporio-credito";
import type { OrcamentoView } from "@/lib/actions/emporio-orcamentos";
import type { Falta } from "@/lib/emporio/cliente-cadastro";
import { AbrirTurnoForm } from "./abrir-turno-form";
import {
  cargaDoOrcamento,
  ObservacaoDoOrcamento,
  OrcamentoNaVenda,
  ResumoDoOrcamento,
  SeletorDeModo,
  type ModoDoBalcao,
} from "./balcao-orcamento";
import { CaixaDaOperacao } from "./caixa-da-operacao";
import {
  AVISO_SEM_ESCOLHA,
  corpoDoPedidoParaEntrega,
  PEDIDO_RETIRADA,
  PedidoParaEntregaCampos,
  type PedidoParaEntregaValor,
} from "./pedido-para-entrega-campos";
import { abertosDaLoja, caixaInicial, fechadosDaLoja, paraCaixasDaLoja, type CaixaDaLoja } from "./caixas-da-loja";
import { VendaCampos } from "./venda-campos";
import { numeroBr, numeroDaVenda } from "./formato";
import { FORMA_ROTULO } from "./venda-rotulos";
import { useVenda, type PrecosVenda, type ProdutoVenda, type RegraCartaoVenda } from "./venda-estado";

/**
 * O balcão (Q87): a venda de dez segundos. Abre direto na venda, sem lista na
 * frente, e foi desenhado para o celular: alvos de 44px, total e botão de
 * fechar a venda presos no rodapé da tela.
 *
 * Não é um `FormSheet`: o balcão é uma PÁGINA, e abrir um painel lateral por
 * cima de um balcão que já ocupa a tela só adicionaria um toque a cada venda.
 * Os campos (`VendaCampos`) vivem no kit (`Field`), a recusa do servidor cai
 * embaixo do campo certo pelo `useErrosDeFormulario`, e o foco vai para o
 * primeiro campo recusado, como no `FormSheet`.
 *
 * A `operation_key` é uma por venda: reenviar a MESMA venda (falha de rede)
 * reaproveita a chave e devolve a venda já gravada; mexer na venda gera outra.
 *
 * Entrega 4: o mesmo balcão salva orçamento (modo Orçamento, sem pagamento nem
 * caixa) e fatura um orçamento salvo (na Venda, pelo número ou por
 * `?orcamento=<id>`). O orçamento carregado nunca atravessa de um atendimento
 * para o outro: trocar de loja, gravar a venda ou "Novo atendimento" o tiram,
 * como já tiram o vendedor escolhido.
 *
 * Plano 3: o "Pedido para entrega" fica logo abaixo do cliente, nos dois modos.
 * Ele vai explícito no corpo (faturando, pré-preenchido com o do orçamento) e
 * entra na assinatura da chave: mudar a marca ou o endereço é outra operação.
 */

const ORDEM = [
  "establishment_id",
  "number",
  "quote_id",
  "items",
  "customer_id",
  "for_delivery",
  "delivery_address_kind",
  "delivery_zip",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_district",
  "delivery_city",
  "delivery_state",
  "payments",
  "notes",
  "seller_user_id",
  "cash_register_id",
] as const;

/** A mesma frase do servidor (`SELLER_REQUIRED`): a recusa daqui e a de lá são indistinguíveis. */
const AVISO_SEM_VENDEDOR = "Escolha o vendedor que atendeu.";

const AVISO_SEM_CAIXA = "Nenhum caixa aberto nesta loja. Abra o caixa com o troco inicial para vender.";
const AVISO_VARIOS = "Há mais de um caixa aberto. Escolha o caixa.";

const CHAVE_LOJA = "tibe:emporio:loja-do-balcao";

type VendaGravada = {
  id: string;
  number: number;
  net_amount: number;
  customer_name: string | null;
  seller_name: string | null;
  quote: { id: string; numero: string } | null;
  for_delivery: boolean;
  items: { product_name: string; presentation_name: string; quantity: number }[];
  payments: { kind: string; amount: number }[];
};

type Resumo = { venda: VendaGravada; trocoCent: number };

export function Balcao({
  lojas,
  produtos,
  precos,
  consumidorFinal,
  usuarioId,
  vendedoresPorLoja,
  ehCaixa,
  orcamentoInicial = null,
}: {
  /** `/emporio/vender?orcamento=<id>`: o balcão abre na Venda com este orçamento carregado. */
  orcamentoInicial?: OrcamentoView | null;
  lojas: { id: string; name: string }[];
  produtos: ProdutoVenda[];
  precos: PrecosVenda;
  consumidorFinal: { id: string; name: string };
  /** Quem está vendendo, vindo da sessão no servidor: compara com quem abriu cada caixa. */
  usuarioId: string;
  /** Quem pode ser o vendedor em cada loja (`vendedoresDaLoja`, lido no servidor). */
  vendedoresPorLoja: Record<string, { id: string; name: string }[]>;
  /** O Caixa não é vendedor: ele escolhe quem atendeu. Os demais vendem em nome próprio. */
  ehCaixa: boolean;
}) {
  const err = useErrosDeFormulario(ORDEM);
  const [regras, setRegras] = useState<RegraCartaoVenda[] | null>(null);
  const [cargaInicial] = useState(() => (orcamentoInicial ? cargaDoOrcamento(orcamentoInicial, consumidorFinal) : null));
  const v = useVenda({
    produtos,
    precos,
    lojaInicial: orcamentoInicial?.establishment_id ?? (lojas.length === 1 ? lojas[0].id : ""),
    regras,
    cargaInicial,
  });
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [modo, setModo] = useState<ModoDoBalcao>("venda");
  // O orçamento posto na Venda para faturar: o envio leva `quote_id`.
  const [orcamento, setOrcamento] = useState<OrcamentoView | null>(orcamentoInicial);
  const [notas, setNotas] = useState("");
  const [orcamentoSalvo, setOrcamentoSalvo] = useState<OrcamentoView | null>(null);
  const [pedido, setPedido] = useState<PedidoParaEntregaValor>(() => cargaInicial?.pedido ?? PEDIDO_RETIRADA);
  // O que falta no cliente para entrega: o quadro do cliente mostra, com "Completar cadastro".
  const [faltaDoPedido, setFaltaDoPedido] = useState<Falta | null>(null);
  // Cada escolha do cliente (também a de "Completar cadastro", com o mesmo id) relê os endereços dele.
  const [escolhaDoCliente, setEscolhaDoCliente] = useState(0);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);

  // Os caixas da loja escolhida, lidos do servidor: mudam entre uma venda e outra.
  const [lidos, setLidos] = useState<{ lojaId: string; lista: CaixaDaLoja[] } | null>(null);
  const [caixa, setCaixa] = useState("");
  const [caixaParaAbrir, setCaixaParaAbrir] = useState("");
  // Verdadeiro quando foi o "Fechar a venda" que bateu no caixa fechado: aberto o caixa, a venda segue sozinha.
  const retomar = useRef(false);

  // A venda que segue sozinha depois de abrir o caixa só vale para ESTA venda: trocar de loja
  // ou mexer nos itens ou no pagamento desfaz o "retomar", para o caixa aberto depois não
  // fechar uma venda que a pessoa já não está olhando.
  const assinaturaDoCarrinho = v.montar(false).assinatura;
  const lojaDoRetomar = v.loja;
  useEffect(() => {
    retomar.current = false;
  }, [lojaDoRetomar, assinaturaDoCarrinho]);

  // A loja da última venda volta sozinha. Lido no efeito, não no estado
  // inicial, para o HTML do servidor e o do navegador não divergirem.
  const { loja, setLoja } = v;
  useEffect(() => {
    if (lojas.length <= 1 || loja !== "") return;
    try {
      const guardada = window.localStorage.getItem(CHAVE_LOJA);
      if (guardada && lojas.some((l) => l.id === guardada)) setLoja(guardada);
    } catch {
      // Armazenamento bloqueado: a pessoa escolhe a loja de novo, sem prejuízo.
    }
  }, [lojas, loja, setLoja]);

  // As taxas de cartão das lojas, só para informar o líquido e avisar antes de
  // enviar. Se a leitura falhar, o balcão segue sem o aviso e o servidor recusa
  // em `payments` a venda no cartão sem taxa.
  useEffect(() => {
    let vivo = true;
    void apiGet<RegraCartaoVenda[]>("/api/v1/emporio/card-fee-rules").then((res) => {
      if (vivo && res.ok) setRegras(res.data);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Ao escolher a loja, já se sabe se há caixa a escolher ou a abrir.
  useEffect(() => {
    if (!loja) return;
    let vivo = true;
    void apiGet<CaixaRegistradoView[]>(`/api/v1/emporio/cash/registers?establishment_id=${encodeURIComponent(loja)}`).then(
      (res) => {
        if (vivo && res.ok) setLidos({ lojaId: loja, lista: paraCaixasDaLoja(res.data) });
      },
    );
    return () => {
      vivo = false;
    };
  }, [loja]);

  // O crédito do cliente, lido quando a venda tem cliente de verdade e um pagamento em fiado: só informa
  // (a recusa de verdade é do servidor). Lido de novo a cada vez que o par cliente + fiado reaparece.
  const temFiado = v.pagamentos.some((p) => p.kind === "fiado");
  const clienteDoFiado = temFiado && v.cliente && !v.cliente.fixed ? v.cliente.id : null;
  const [lidoDoCredito, setLidoDoCredito] = useState<{ clienteId: string; credito: CreditoView } | null>(null);
  useEffect(() => {
    if (!clienteDoFiado) return;
    let vivo = true;
    void apiGet<CreditoView>(`/api/v1/emporio/customers/${encodeURIComponent(clienteDoFiado)}/credit`).then((res) => {
      if (vivo && res.ok) setLidoDoCredito({ clienteId: clienteDoFiado, credito: res.data });
    });
    return () => {
      vivo = false;
    };
  }, [clienteDoFiado]);
  const creditoDoFiado = lidoDoCredito && lidoDoCredito.clienteId === clienteDoFiado ? lidoDoCredito.credito : null;
  // A recusa de crédito do servidor (bloqueio ou limite): mostra o caminho para o Gestor liberar.
  const [recusaDeCredito, setRecusaDeCredito] = useState(false);

  // O vendedor: a escolha só vale se ainda está na lista da loja (trocar de loja a descarta). Quem não é Caixa
  // começa nele mesmo, quando ele vende naquela loja.
  const [vendedorEscolhido, setVendedorEscolhido] = useState("");
  // Nunca atravessa lojas: A, B, A volta vazio (o Caixa escolhe de novo, o resto cai nele mesmo).
  const vendedores = vendedoresPorLoja[loja] ?? [];
  const vendedor = vendedores.some((u) => u.id === vendedorEscolhido)
    ? vendedorEscolhido
    : !ehCaixa && vendedores.some((u) => u.id === usuarioId)
      ? usuarioId
      : "";

  const caixasDaLoja = lidos && lidos.lojaId === loja ? lidos.lista : null;
  const abertos = caixasDaLoja ? abertosDaLoja(caixasDaLoja, loja) : [];
  const fechados = caixasDaLoja ? fechadosDaLoja(caixasDaLoja, loja) : [];
  const caixaEscolhido = abertos.some((c) => c.id === caixa) ? caixa : caixaInicial(abertos, usuarioId);
  const alvoDaAbertura = fechados.length === 1 ? fechados[0] : fechados.find((c) => c.id === caixaParaAbrir);
  // Um caixa aberto só: o servidor resolve e a tela não pergunta. Zero ou vários, ou uma recusa do servidor: pergunta.
  // O orçamento não mexe em dinheiro: no modo Orçamento o caixa nem aparece.
  const mostrarCaixa =
    modo === "venda" && loja !== "" && caixasDaLoja !== null && (abertos.length !== 1 || !!err.erros.cash_register_id);
  // Faturando um orçamento, o vendedor é o dele (o servidor o herda): a tela mostra e não pergunta.
  const vendedorTravado = modo === "venda" && orcamento !== null;

  // O mesmo efeito do FormSheet: leva o foco ao primeiro campo recusado.
  useEffect(() => {
    if (!err.focarCampoId) return;
    const alvo = document.getElementById(err.focarCampoId);
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [err.focarCampoId, err.tentativa]);

  function lembrarLoja(id: string) {
    setVendedorEscolhido("");
    setPedido(PEDIDO_RETIRADA);
    // O orçamento só se fatura na loja dele: trocar de loja o tira (o `setLoja` já tirou o preço dele).
    setOrcamento(null);
    try {
      window.localStorage.setItem(CHAVE_LOJA, id);
    } catch {
      // Sem armazenamento, só não lembra.
    }
  }

  function tirarOrcamento() {
    setOrcamento(null);
    v.soltarOrcamento();
  }

  /** Põe o orçamento na Venda: itens, preço que vale, cliente; o vendedor passa a ser o dele. */
  function carregarNaVenda(q: OrcamentoView) {
    if (q.establishment_id !== v.loja) {
      v.setLoja(q.establishment_id);
      lembrarLoja(q.establishment_id);
    }
    const carga = cargaDoOrcamento(q, consumidorFinal);
    v.carregarOrcamento(carga);
    setPedido(carga.pedido);
    setOrcamento(q);
    setVendedorEscolhido("");
    setModo("venda");
    setResumo(null);
    setOrcamentoSalvo(null);
    err.limparTudo();
  }

  function mudarModo(novo: ModoDoBalcao) {
    if (novo === modo) return;
    // O orçamento carregado é para faturar: num orçamento novo ele não vale.
    if (novo === "orcamento" && orcamento) tirarOrcamento();
    setModo(novo);
    err.limparTudo();
  }

  function novoAtendimento() {
    setOrcamentoSalvo(null);
    setResumo(null);
    v.reiniciar();
    setOrcamento(null);
    setVendedorEscolhido("");
    setNotas("");
    setPedido(PEDIDO_RETIRADA);
    chave.current = null;
    err.limparTudo();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarOrcamento() {
    const m = v.montar(true, { orcamento: true });
    const novos: typeof m.novos & { seller_user_id?: string; delivery_address_kind?: string } = { ...m.novos };
    if (ehCaixa && !vendedor) novos.seller_user_id = AVISO_SEM_VENDEDOR;
    if (pedido.for_delivery && !pedido.delivery_address_kind) novos.delivery_address_kind = AVISO_SEM_ESCOLHA;
    if (!m.corpo || novos.seller_user_id || novos.delivery_address_kind) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const observacao = notas.trim();
    const corpoDoPedido = corpoDoPedidoParaEntrega(pedido);
    const assinatura = JSON.stringify([m.assinatura, vendedor, observacao, corpoDoPedido]);
    if (chave.current?.assinatura !== assinatura) {
      chave.current = { assinatura, key: crypto.randomUUID() };
    }
    setEnviando(true);
    const res = await apiPost<OrcamentoView>("/api/v1/emporio/quotes", {
      operation_key: chave.current.key,
      establishment_id: m.corpo.establishment_id,
      customer_id: m.corpo.customer_id,
      items: m.corpo.items,
      ...corpoDoPedido,
      ...(vendedor ? { seller_user_id: vendedor } : {}),
      notes: observacao || null,
    });
    setEnviando(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    setOrcamentoSalvo(res.data);
    setResumo(null);
    v.reiniciar();
    setNotas("");
    setPedido(PEDIDO_RETIRADA);
    // Como na venda: a escolha do vendedor não passa para o próximo atendimento.
    setVendedorEscolhido("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enviar(recemAberto?: string) {
    if (modo === "orcamento") {
      await salvarOrcamento();
      return;
    }
    const m = v.montar(true);
    const novos: typeof m.novos & { seller_user_id?: string; quote_id?: string; delivery_address_kind?: string } = {
      ...m.novos,
    };
    if (ehCaixa && !vendedor && !orcamento) novos.seller_user_id = AVISO_SEM_VENDEDOR;
    if (pedido.for_delivery && !pedido.delivery_address_kind) novos.delivery_address_kind = AVISO_SEM_ESCOLHA;
    // O orçamento já faturado (aberto por `?orcamento=`): a mesma frase da faixa e do servidor.
    if (orcamento?.situacao === "faturado" && orcamento.sale) {
      novos.quote_id = `Este orçamento já foi faturado na venda nº ${orcamento.sale.numero}.`;
    }
    if (!m.corpo || novos.seller_user_id || novos.quote_id || novos.delivery_address_kind) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setRecusaDeCredito(false);
    setEnviando(true);
    // Toda venda precisa de turno aberto: confere os caixas na hora de fechar (podem ter mudado desde que a loja foi escolhida).
    const fresco = await apiGet<CaixaRegistradoView[]>(
      `/api/v1/emporio/cash/registers?establishment_id=${encodeURIComponent(v.loja)}`,
    );
    let escolhido = caixaEscolhido;
    if (fresco.ok) {
      const lista = paraCaixasDaLoja(fresco.data);
      setLidos({ lojaId: v.loja, lista });
      const ab = abertosDaLoja(lista, v.loja);
      const preferido = recemAberto ?? caixa;
      escolhido = ab.some((c) => c.id === preferido) ? preferido : caixaInicial(ab, usuarioId);
      if (ab.length === 0 || (ab.length > 1 && !escolhido)) {
        // Volta à escolha do caixa, com o carrinho intacto: a tela mostra abrir ou escolher.
        retomar.current = ab.length === 0;
        setEnviando(false);
        err.setGlobal(null);
        err.reprovar({ cash_register_id: ab.length === 0 ? AVISO_SEM_CAIXA : AVISO_VARIOS });
        return;
      }
    }

    const corpoDoPedido = corpoDoPedidoParaEntrega(pedido);
    const assinatura = JSON.stringify([m.assinatura, escolhido, vendedor, orcamento?.id ?? null, corpoDoPedido]);
    if (chave.current?.assinatura !== assinatura) {
      chave.current = { assinatura, key: crypto.randomUUID() };
    }
    const trocoCent = v.trocoCent;
    const res = await apiPost<VendaGravada>("/api/v1/emporio/sales", {
      operation_key: chave.current.key,
      ...m.corpo,
      ...corpoDoPedido,
      // Faturando, o vendedor é o do orçamento: o servidor o herda, e a tela não manda outro.
      ...(orcamento ? { quote_id: orcamento.id } : vendedor ? { seller_user_id: vendedor } : {}),
      cash_register_id: escolhido || null,
    });
    setEnviando(false);
    if (!res.ok) {
      err.doServidor(res);
      setRecusaDeCredito(res.code === "FIADO_BLOQUEADO" || res.code === "LIMITE_EXCEDIDO");
      if (res.code === "CASH_CLOSED" || res.code === "CASH_REGISTER_REQUIRED") {
        // O servidor discorda da tela: lê de novo os caixas para a escolha refletir o que existe agora.
        retomar.current = res.code === "CASH_CLOSED";
        const atual = await apiGet<CaixaRegistradoView[]>(
          `/api/v1/emporio/cash/registers?establishment_id=${encodeURIComponent(v.loja)}`,
        );
        if (atual.ok) setLidos({ lojaId: v.loja, lista: paraCaixasDaLoja(atual.data) });
      }
      return;
    }
    chave.current = null;
    retomar.current = false;
    setResumo({ venda: res.data, trocoCent });
    setOrcamentoSalvo(null);
    v.reiniciar();
    // O Caixa escolhe o vendedor a cada venda: a escolha anterior não passa para a próxima. O orçamento e o pedido, idem.
    setVendedorEscolhido("");
    setOrcamento(null);
    setPedido(PEDIDO_RETIRADA);
    // Tira o `?orcamento=` do endereço, para recarregar a página não trazer de volta o
    // orçamento faturado. Sem `router.replace`: a página relida remontaria o balcão
    // (a `key` dele é o orçamento) e o resumo da venda sumiria.
    if (orcamento && new URLSearchParams(window.location.search).has("orcamento")) {
      window.history.replaceState(null, "", "/emporio/vender");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <SeletorDeModo modo={modo} aoMudar={mudarModo} />

      {orcamentoSalvo && (
        <ResumoDoOrcamento
          orcamento={orcamentoSalvo}
          aoFaturar={() => carregarNaVenda(orcamentoSalvo)}
          aoNovo={novoAtendimento}
        />
      )}

      {resumo && (
        <section
          role="status"
          className="space-y-1 rounded-lg border border-borda bg-sucesso-suave p-4 text-sm text-sucesso-tinta"
        >
          <p className="font-semibold">
            Venda registrada: {reaisBr(resumo.venda.net_amount)}
            <span className="ml-2 font-normal">
              Venda nº {numeroDaVenda(resumo.venda.number)}
              {resumo.venda.for_delivery ? ", para entrega" : ""}
            </span>
          </p>
          <p>
            {resumo.venda.items
              .map((i) => `${numeroBr(i.quantity)} × ${i.product_name} (${i.presentation_name})`)
              .join("; ")}
          </p>
          <p>
            {resumo.venda.payments.map((p) => `${FORMA_ROTULO[p.kind] ?? p.kind} ${reaisBr(p.amount)}`).join(", ")}
            {resumo.venda.customer_name ? `, cliente ${resumo.venda.customer_name}` : ""}
            {resumo.venda.seller_name ? `, vendedor ${resumo.venda.seller_name}` : ""}
            {resumo.venda.quote ? `, do orçamento nº ${resumo.venda.quote.numero}` : ""}
          </p>
          {resumo.trocoCent > 0 && (
            <p className="font-semibold">Troco entregue: {reaisBr(resumo.trocoCent / 100)}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href={`/emporio/vendas/${resumo.venda.id}`} className="inline-block font-medium underline">
              Ver a venda
            </Link>
            <a
              href={`/emporio/imprimir/venda/${resumo.venda.id}?formato=a4`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium underline"
            >
              Imprimir A4
            </a>
            <a
              href={`/emporio/imprimir/venda/${resumo.venda.id}?formato=cupom`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium underline"
            >
              Imprimir cupom
            </a>
            <a
              href={`/emporio/imprimir/romaneio/${resumo.venda.id}?formato=a4`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium underline"
            >
              Romaneio A4
            </a>
            <a
              href={`/emporio/imprimir/romaneio/${resumo.venda.id}?formato=cupom`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium underline"
            >
              Romaneio cupom
            </a>
          </div>
        </section>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          // Os painéis do campo Cliente (cadastrar, completar) são filhos desta
          // árvore do React: o submit deles sobe até aqui, e não pode fechar a venda.
          if (e.target !== e.currentTarget) return;
          if (enviando) return;
          void enviar();
        }}
        className="space-y-4"
      >
        <div className="rounded-lg border border-borda bg-superficie p-4 shadow-sm">
          <VendaCampos
            v={v}
            produtos={produtos}
            lojas={lojas}
            consumidorFinal={consumidorFinal}
            erros={err.erros}
            idDe={err.idDe}
            limpar={err.limparCampo}
            permitirCadastro
            aoEscolherLoja={lembrarLoja}
            semPagamento={modo === "orcamento"}
            creditoDoFiado={creditoDoFiado}
            depoisDoPagamento={
              recusaDeCredito && err.erros.payments && v.cliente ? (
                <p className="text-sm text-texto-secundario">
                  <Link href={`/emporio/clientes/${v.cliente.id}`} className="font-medium text-texto-marca hover:underline">
                    Abrir a ficha do cliente para o gestor liberar
                  </Link>
                  . Ou troque a forma de pagamento.
                </p>
              ) : undefined
            }
            avisoDoCliente={pedido.for_delivery ? faltaDoPedido : null}
            aoEscolherCliente={(c) => {
              // Trocar o cliente limpa a escolha do endereço e mantém a marca.
              if (c.id !== v.cliente?.id) {
                setPedido((p) => ({ ...p, delivery_address_kind: "" }));
                err.limparCampo("delivery_address_kind");
              }
              setEscolhaDoCliente((n) => n + 1);
            }}
            depoisDoCliente={
              <PedidoParaEntregaCampos
                key={escolhaDoCliente}
                valor={pedido}
                aoMudar={setPedido}
                customerId={v.cliente?.id ?? null}
                erros={err.erros}
                idDe={err.idDe}
                limpar={err.limparCampo}
                aoVerFalta={setFaltaDoPedido}
              />
            }
            depoisDaLoja={
              modo === "venda" ? (
                <OrcamentoNaVenda
                  loja={loja}
                  orcamento={orcamento}
                  produtos={produtos}
                  erros={err.erros}
                  idDe={err.idDe}
                  limpar={err.limparCampo}
                  reprovar={(novos) => {
                    err.setGlobal(null);
                    err.reprovar(novos);
                  }}
                  aoRecusar={err.doServidor}
                  aoCarregar={carregarNaVenda}
                  aoTirar={tirarOrcamento}
                />
              ) : undefined
            }
          />
        </div>

        {modo === "orcamento" && (
          <div className="rounded-lg border border-borda bg-superficie p-4 shadow-sm">
            <ObservacaoDoOrcamento
              id={err.idDe("notes")}
              valor={notas}
              erro={err.erros.notes}
              aoMudar={(valor) => {
                setNotas(valor);
                err.limparCampo("notes");
              }}
            />
          </div>
        )}

        {loja !== "" && (
          <div className="rounded-lg border border-borda bg-superficie p-4 shadow-sm">
            <Field
              label="Vendedor"
              required={ehCaixa && !vendedorTravado}
              id={err.idDe("seller_user_id")}
              error={err.erros.seller_user_id}
              hint={
                vendedorTravado
                  ? "O vendedor do orçamento."
                  : vendedores.length === 0
                    ? "Nenhum vendedor vinculado a esta loja."
                    : undefined
              }
            >
              {({ id, ...aria }) =>
                vendedorTravado ? (
                  <p id={id} tabIndex={-1} {...aria} className="text-sm font-medium text-texto">
                    {orcamento?.seller_name ?? "Sem vendedor no orçamento"}
                  </p>
                ) : (
                  <Select
                    value={vendedor}
                    onValueChange={(valor) => {
                      // O Radix dispara "" quando o valor some da lista: nunca é escolha de ninguém.
                      if (valor === "") return;
                      setVendedorEscolhido(valor);
                      err.limparCampo("seller_user_id");
                    }}
                  >
                    <SelectTrigger id={id} {...aria}>
                      <SelectValue placeholder="Escolha o vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>
          </div>
        )}

        {mostrarCaixa && (
          <div className="rounded-lg border border-borda bg-superficie p-4 shadow-sm">
            <Field
              label="Caixa"
              required
              id={err.idDe("cash_register_id")}
              error={err.erros.cash_register_id}
              hint={abertos.length === 0 ? "A venda continua aqui assim que o caixa abrir." : undefined}
            >
              {({ id, ...aria }) =>
                abertos.length === 0 ? (
                  <div id={id} tabIndex={-1} {...aria} className="space-y-2">
                    <p className="text-sm text-texto-secundario">{AVISO_SEM_CAIXA}</p>
                    {fechados.length > 1 && (
                      <Select
                        value={caixaParaAbrir}
                        onValueChange={(c) => {
                          setCaixaParaAbrir(c);
                          err.limparCampo("cash_register_id");
                        }}
                      >
                        <SelectTrigger aria-label="Caixa a abrir">
                          <SelectValue placeholder="Escolha o caixa a abrir" />
                        </SelectTrigger>
                        <SelectContent>
                          {fechados.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {alvoDaAbertura ? (
                      <AbrirTurnoForm
                        key={alvoDaAbertura.id}
                        caixaId={alvoDaAbertura.id}
                        caixaNome={alvoDaAbertura.nome}
                        saldoCent={Math.round(alvoDaAbertura.saldo * 100)}
                        trigger={
                          <Button type="button" variant="outline">
                            Abrir o {alvoDaAbertura.nome}
                          </Button>
                        }
                        aoFechar={() => {
                          retomar.current = false;
                        }}
                        aoAbrir={async (aberto) => {
                          const res = await apiGet<CaixaRegistradoView[]>(
                            `/api/v1/emporio/cash/registers?establishment_id=${encodeURIComponent(loja)}`,
                          );
                          if (res.ok) setLidos({ lojaId: loja, lista: paraCaixasDaLoja(res.data) });
                          setCaixa(aberto);
                          err.limparCampo("cash_register_id");
                          if (retomar.current) {
                            retomar.current = false;
                            void enviar(aberto);
                          }
                        }}
                      />
                    ) : (
                      fechados.length === 0 && (
                        <Link href="/emporio/caixa" className="text-sm font-medium text-texto-marca hover:underline">
                          Ir para o Caixa
                        </Link>
                      )
                    )}
                  </div>
                ) : (
                  <CaixaDaOperacao
                    id={id}
                    aria={aria}
                    abertos={abertos}
                    valor={caixaEscolhido}
                    aoMudar={(c) => {
                      setCaixa(c);
                      err.limparCampo("cash_register_id");
                    }}
                  />
                )
              }
            </Field>
          </div>
        )}

        <div className="sticky bottom-0 -mx-1 space-y-2 border-t border-borda bg-superficie px-4 py-3 shadow-sm sm:mx-0 sm:rounded-lg sm:border">
          {err.global && (
            <p role="alert" className="rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">
              {err.global}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-texto-secundario">
                {modo === "orcamento" ? "Total do orçamento" : "Total da venda"}
              </p>
              <p className="text-xl font-semibold text-texto">{reaisBr(v.totalCent / 100)}</p>
            </div>
            {modo === "orcamento" ? (
              <div className="flex flex-wrap gap-2">
                {/* Faturar sem salvar: passa o carrinho para a Venda, sem `quote_id`. */}
                <Button type="button" variant="outline" size="lg" disabled={enviando} onClick={() => mudarModo("venda")}>
                  Faturar
                </Button>
                <Button type="submit" size="lg" disabled={enviando} className="min-w-40">
                  {enviando ? "Salvando..." : "Salvar orçamento"}
                </Button>
              </div>
            ) : (
              <Button type="submit" size="lg" disabled={enviando} className="min-w-40">
                {enviando ? "Registrando..." : "Fechar a venda"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
