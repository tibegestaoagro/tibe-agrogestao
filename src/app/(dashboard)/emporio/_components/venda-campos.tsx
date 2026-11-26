"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { reaisBr } from "@/lib/numero-br";
import { ORIGENS_DA_VENDA, ROTULO_DA_ORIGEM } from "@/lib/emporio/frete";
import type { CreditoView } from "@/lib/actions/emporio-credito";
import type { Falta } from "@/lib/emporio/cliente-cadastro";
import type { ClienteEscolhido } from "@/lib/emporio/cliente-escolhido";
import { EscolherCliente } from "./escolher-cliente";
import { pctBr } from "./formato";
import { CampoDaAutorizacao, CamposDosItens } from "./venda-campos-itens";
import { CampoDoPagamento } from "./venda-campos-pagamento";
import type {
  CampoDaFranquia,
  CampoDaVenda,
  EstadoDaVenda,
  ProdutoVenda,
} from "./venda-estado";

// A conta do PIX vive com o resto do pagamento: quem importava daqui continua importando.
export { ContaPixSelect } from "./venda-campos-pagamento";

/** O item "Nenhum" do franqueado: o Radix não aceita valor vazio num item. */
const SEM_FRANQUEADO = "nenhum";

/**
 * O franqueado e o crédito dele (Q301), no balcão, na venda e no orçamento. Os ids são os nomes da API
 * (`franchisee_id`, `franchisee_credit`). Fica fora de `VendaCampos` porque a troca usa os mesmos campos
 * e não tem franqueado. Sem franqueado na lista e nenhum escolhido (perfil que não os vê), não aparece.
 */
export function FranquiaCampos({
  v,
  franqueados,
  erros,
  idDe,
  limpar,
}: {
  v: EstadoDaVenda;
  franqueados: { id: string; name: string }[];
  erros: Partial<Record<CampoDaFranquia, string>>;
  idDe: (campo: CampoDaFranquia) => string;
  limpar: (campo: CampoDaFranquia | "payments") => void;
}) {
  if (franqueados.length === 0 && v.franqueadoId === "") return null;
  return (
    <>
      <Field label="Franqueado (opcional)" id={idDe("franchisee_id")} error={erros.franchisee_id}>
        {({ id, ...aria }) => (
          <Select
            value={v.franqueadoId === "" ? SEM_FRANQUEADO : v.franqueadoId}
            onValueChange={(valor) => {
              // O Radix dispara "" quando o valor some da lista: nunca é escolha de ninguém.
              if (valor === "") return;
              v.definirFranqueado(valor === SEM_FRANQUEADO ? "" : valor);
              limpar("franchisee_id");
              limpar("franchisee_credit");
              limpar("payments");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FRANQUEADO}>Nenhum</SelectItem>
              {franqueados.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        label="Crédito do franqueado (R$)"
        id={idDe("franchisee_credit")}
        error={erros.franchisee_credit}
        hint="Cobrado do cliente a mais e repassado ao franqueado: não entra no faturamento da loja."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            placeholder="0,00"
            value={v.credito}
            onValueChange={(valor) => {
              v.definirCredito(valor);
              limpar("franchisee_credit");
              limpar("franchisee_id");
              limpar("payments");
            }}
          />
        )}
      </Field>
    </>
  );
}

/** A loja da venda. O `id` é `establishment_id`. */
export function CampoDaLoja({
  v,
  lojas,
  erros,
  idDe,
  limpar,
  aoEscolherLoja,
}: {
  v: EstadoDaVenda;
  lojas: { id: string; name: string }[];
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  aoEscolherLoja?: (id: string) => void;
}) {
  return (
    <Field label="Loja" required id={idDe("establishment_id")} error={erros.establishment_id}>
      {({ id, ...aria }) => (
        <Select
          value={v.loja}
          onValueChange={(valor) => {
            v.setLoja(valor);
            limpar("establishment_id");
            aoEscolherLoja?.(valor);
          }}
        >
          <SelectTrigger id={id} {...aria}>
            <SelectValue placeholder="Escolha a loja" />
          </SelectTrigger>
          <SelectContent>
            {lojas.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

/** O campo "Desconto no total (R$)": só o campo, a linha do total fica com quem monta a tela. */
export function CampoDoDescontoNoTotal({
  v,
  erros,
  idDe,
  limpar,
}: {
  v: EstadoDaVenda;
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
}) {
  return (
    <Field
      label="Desconto no total (R$, opcional)"
      id={idDe("order_discount_amount")}
      error={erros.order_discount_amount}
      hint="Reparte nos itens pelo valor de cada um."
    >
      {({ id, ...aria }) => (
        <MoneyInput
          id={id}
          {...aria}
          placeholder="0,00"
          value={v.descontoTotal}
          onValueChange={(valor) => {
            v.definirDescontoTotal(valor);
            limpar("order_discount_amount");
            limpar("items");
            limpar("discount_authorization");
            limpar("payments");
          }}
        />
      )}
    </Field>
  );
}

/**
 * O cliente da venda. `pedirTroca` é aceita para a tela que pedir a troca de cliente com o motivo, e
 * por enquanto não muda nada.
 */
export function CampoDoCliente({
  v,
  consumidorFinal,
  erros,
  idDe,
  limpar,
  permitirCadastro,
  avisoDoCliente,
  aoEscolherCliente,
  clienteTravado,
  teclaDoCliente,
}: {
  v: EstadoDaVenda;
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  /** O cliente fixo, sempre no topo da janela de escolha. */
  consumidorFinal: { id: string; name: string };
  /** "Cadastrar novo cliente" e "Completar cadastro" no campo Cliente. */
  permitirCadastro?: boolean;
  /** O que falta no cliente para o pedido para entrega: o quadro do cliente mostra, com "Completar cadastro". */
  avisoDoCliente?: Falta | null;
  /** Chamado a cada escolha (também depois de completar o cadastro), antes de `setCliente`. */
  aoEscolherCliente?: (c: ClienteEscolhido) => void;
  /** Q382: venda que nasce de orçamento: o cliente é o do orçamento e não se troca. */
  clienteTravado?: boolean;
  pedirTroca?: { n: number; motivo: string } | null;
  /** A tecla do atalho do cliente (um `TeclaDoAtalho`): posta na linha do rótulo, acima do "Trocar"; sem ela, nada muda. */
  teclaDoCliente?: ReactNode;
}) {
  const campo = (
    <Field label="Cliente" required id={idDe("customer_id")} error={erros.customer_id}>
      {(campo) => (
        <EscolherCliente
          campo={campo}
          consumidorFinal={consumidorFinal}
          valor={v.cliente}
          onEscolher={(c) => {
            aoEscolherCliente?.(c);
            v.setCliente(c);
            limpar("customer_id");
          }}
          permitirCadastro={!!permitirCadastro}
          aviso={avisoDoCliente ?? null}
          travado={!!clienteTravado}
        />
      )}
    </Field>
  );
  return teclaDoCliente ? (
    <div className="relative">
      {teclaDoCliente}
      {campo}
    </div>
  ) : (
    campo
  );
}

/** O frete cobrado e, na venda, a origem. Os ids são `freight_amount` e `origin`. */
export function CamposDoFrete({
  v,
  erros,
  idDe,
  limpar,
  comOrigem,
}: {
  v: EstadoDaVenda;
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  comOrigem: boolean;
}) {
  return (
    <>
      <Field label="Frete cobrado do cliente (opcional)" id={idDe("freight_amount")} error={erros.freight_amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            placeholder="0,00"
            value={v.frete}
            onValueChange={(valor) => {
              v.definirFrete(valor);
              limpar("freight_amount");
              limpar("payments");
            }}
          />
        )}
      </Field>
      {comOrigem && (
        <Field label="Origem da venda" id={idDe("origin")} error={erros.origin}>
          {({ id, ...aria }) => (
            <div id={id} tabIndex={-1} {...aria} className="flex flex-wrap gap-2">
              {ORIGENS_DA_VENDA.map((o) => (
                <Button
                  key={o}
                  type="button"
                  size="sm"
                  variant={v.origem === o ? "default" : "outline"}
                  aria-pressed={v.origem === o}
                  onClick={() => {
                    v.definirOrigem(o);
                    limpar("origin");
                  }}
                >
                  {ROTULO_DA_ORIGEM[o]}
                </Button>
              ))}
            </div>
          )}
        </Field>
      )}
    </>
  );
}

/** A lista "Itens, desconto, frete, total" do modo Orçamento. */
export function ResumoDoOrcamentoNaTela({ v }: { v: EstadoDaVenda }) {
  if (v.linhas.length === 0) return null;
  return (
      <dl className="space-y-1 rounded-lg bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario" aria-live="polite">
        <div className="flex justify-between gap-3">
          <dt>Itens</dt>
          <dd>{reaisBr(v.somaItensCent / 100)}</dd>
        </div>
        {v.descontoNoTotalCent > 0 && (
          <div className="flex justify-between gap-3">
            <dt>Desconto no total</dt>
            <dd>- {reaisBr(v.descontoNoTotalCent / 100)}</dd>
          </div>
        )}
        {v.freteCent > 0 && (
          <div className="flex justify-between gap-3">
            <dt>Frete</dt>
            <dd>{reaisBr(v.freteCent / 100)}</dd>
          </div>
        )}
        {v.creditoCent > 0 && (
          <div className="flex justify-between gap-3">
            <dt>Crédito do franqueado (fora do faturamento)</dt>
            <dd>{reaisBr(v.creditoCent / 100)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold text-texto">
          <dt>Total do orçamento</dt>
          <dd>{reaisBr((v.totalCent + v.freteCent + v.creditoCent) / 100)}</dd>
        </div>
      </dl>
  );
}

/**
 * Os campos da venda: loja, itens, cliente e pagamento. Não escreve nada e não
 * tem botão de enviar: quem monta a tela (o balcão, a troca) cuida do envio.
 *
 * Os ids dos `Field` são os nomes da API (`establishment_id`, `items`,
 * `customer_id`, `payments`), para a recusa do servidor cair embaixo do campo
 * certo. `prefixoDeId` vem de quem chama, porque o balcão e a troca nunca
 * vivem juntos mas os ids passam pelo mesmo `idDe`.
 */
export function VendaCampos({
  v,
  produtos,
  lojas,
  consumidorFinal,
  erros,
  idDe,
  limpar,
  lojaFixa,
  permitirCadastro,
  aoEscolherLoja,
  semPagamento,
  depoisDaLoja,
  depoisDoCliente,
  avisoDoCliente,
  aoEscolherCliente,
  creditoDoFiado,
  depoisDoPagamento,
  comFrete,
  freteNoOrcamento,
  depoisDoFrete,
  descontoNoTotal,
  autorizacaoHerdada,
  clienteTravado,
}: {
  /** Q382: venda que nasce de orçamento: o cliente é o do orçamento e não se troca. */
  clienteTravado?: boolean;
  /** Q329: o campo "Desconto no total (R$)": só o balcão e o orçamento (a troca não tem). */
  descontoNoTotal?: boolean;
  /** O desconto já vem autorizado (orçamento autorizado, venda editada): a tela não pede de novo antes de o servidor recusar. */
  autorizacaoHerdada?: boolean;
  /** O que o balcão põe logo abaixo do frete e da origem (o franqueado e o crédito), na ordem visual do `ORDEM`. */
  depoisDoFrete?: ReactNode;
  /** Frete cobrado e origem da venda (Q244, Q248): só o balcão, e só na venda (a troca não tem). */
  comFrete?: boolean;
  /** Q326: só o frete, sem a origem: o orçamento no balcão. */
  freteNoOrcamento?: boolean;
  /** O crédito do cliente, lido pelo balcão quando há fiado: só informa, a recusa de verdade é do servidor. */
  creditoDoFiado?: CreditoView | null;
  /** O que o balcão põe logo abaixo do pagamento (o atalho da recusa de crédito). */
  depoisDoPagamento?: ReactNode;
  /** Orçamento (entrega 4): não há pagamento a escolher. */
  semPagamento?: boolean;
  /** O que o balcão põe logo abaixo da loja (o orçamento a faturar), na ordem visual do `ORDEM`. */
  depoisDaLoja?: ReactNode;
  /** O que o balcão põe logo abaixo do cliente (o pedido para entrega), na ordem visual do `ORDEM`. */
  depoisDoCliente?: ReactNode;
  /** O que falta no cliente para o pedido para entrega: o quadro do cliente mostra, com "Completar cadastro". */
  avisoDoCliente?: Falta | null;
  /** Chamado a cada escolha (também depois de completar o cadastro), antes de `setCliente`. */
  aoEscolherCliente?: (c: ClienteEscolhido) => void;
  v: EstadoDaVenda;
  produtos: ProdutoVenda[];
  lojas: { id: string; name: string }[];
  /** O cliente fixo, sempre no topo da janela de escolha. */
  consumidorFinal: { id: string; name: string };
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  /** Troca: a loja é a da venda de origem, não se escolhe. */
  lojaFixa?: boolean;
  /** "Cadastrar novo cliente" e "Completar cadastro" no campo Cliente. */
  permitirCadastro?: boolean;
  aoEscolherLoja?: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      {!lojaFixa && (
        <CampoDaLoja v={v} lojas={lojas} erros={erros} idDe={idDe} limpar={limpar} aoEscolherLoja={aoEscolherLoja} />
      )}

      {depoisDaLoja}

      <CamposDosItens v={v} produtos={produtos} erros={erros} idDe={idDe} limpar={limpar} />

      {descontoNoTotal && (
        <>
          <CampoDoDescontoNoTotal v={v} erros={erros} idDe={idDe} limpar={limpar} />
          {v.linhas.length > 0 && (
            <p className="rounded-lg bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario" aria-live="polite">
              Itens {reaisBr(v.somaItensCent / 100)}, desconto {reaisBr(v.descontoNoTotalCent / 100)}, total{" "}
              <strong className="text-texto">{reaisBr(v.totalCent / 100)}</strong>
            </p>
          )}
        </>
      )}

      <CampoDaAutorizacao
        v={v}
        erros={erros}
        idDe={idDe}
        limpar={limpar}
        autorizacaoHerdada={autorizacaoHerdada}
      />

      <CampoDoCliente
        v={v}
        consumidorFinal={consumidorFinal}
        erros={erros}
        idDe={idDe}
        limpar={limpar}
        permitirCadastro={permitirCadastro}
        avisoDoCliente={avisoDoCliente}
        aoEscolherCliente={aoEscolherCliente}
        clienteTravado={clienteTravado}
      />

      {depoisDoCliente}

      {(comFrete || freteNoOrcamento) && (
        <CamposDoFrete v={v} erros={erros} idDe={idDe} limpar={limpar} comOrigem={!!comFrete} />
      )}

      {depoisDoFrete}

      {semPagamento && <ResumoDoOrcamentoNaTela v={v} />}

      {!semPagamento && (
        <CampoDoPagamento
          v={v}
          erros={erros}
          idDe={idDe}
          limpar={limpar}
          creditoDoFiado={creditoDoFiado}
        />
      )}

      {depoisDoPagamento}

      {v.descontoCent > 0 && (
        <p className="rounded-lg bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
          Desconto total: {reaisBr(v.descontoCent / 100)} ({pctBr(Math.round(v.descontoPct * 100) / 100)} sobre o preço
          sugerido).
        </p>
      )}
    </div>
  );
}
