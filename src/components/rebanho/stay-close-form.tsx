"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
// Só o TIPO, que some na compilação: nada do runtime do Prisma entra no
// bundle do cliente por causa desta linha.
import type { HerdStayType } from "@/generated/prisma/enums";

/**
 * Encerrar uma estadia.
 *
 * A regra do documento é que a soma dos destinos não pode passar do que está
 * na estadia; somar MENOS é válido desde 31/08 e deixa o restante na estadia
 * aberta (§20). O servidor só recusa quando a soma passa do saldo. Aqui isso
 * vira EXPERIÊNCIA: o que falta (ou sobra) aparece enquanto o produtor
 * digita, para ele não descobrir só ao tocar em salvar.
 *
 * Os destinos oferecidos vêm do tipo da estadia, e são os mesmos que a tabela
 * de regras do servidor aceita: desaparecimento não oferece venda.
 */

type Destino = { movement_type: string; rotulo: string; ajuda?: string };

/**
 * ⚠️ `Record<HerdStayType, ...>`, e não `Record<string, ...>`: quando o enum
 * ganhou `confinamento` (fase 3, 31/08), o mapa ficou sem a chave e nada no
 * `tsc` reclamou. O painel abria dizendo "Estão na estadia 30 cabeças. Diga
 * para onde cada uma foi." e não mostrava campo NENHUM; tocar em "Encerrar"
 * mandava `destinos: []` e o Zod recusava no rodapé. Agora falta de chave é
 * erro de compilação, como em `src/lib/related-modules.ts`.
 */
const DESTINOS_POR_TIPO: Record<HerdStayType, Destino[]> = {
  pasto_terceiro: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para a fazenda" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  boitel: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para a fazenda" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  evento: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para a fazenda" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  /**
   * "Voltaram para o pasto", e não "para a fazenda" como nos três acima: no
   * confinamento próprio o gado nunca saiu da fazenda, só do pasto. Os três
   * destinos são os que `stay-rules.ts` aceita para `confinamento`; oferecer
   * um quarto aqui produziria recusa do servidor depois de o produtor
   * preencher.
   */
  confinamento: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para o pasto" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  terceiro_na_fazenda: [
    { movement_type: "saida_terceiro", rotulo: "Devolvidos ao dono" },
  ],
  desaparecimento: [
    { movement_type: "retorno_estadia", rotulo: "Encontrados", ajuda: "Voltam para o pasto." },
    { movement_type: "morte", rotulo: "Morte confirmada" },
    {
      movement_type: "perda_confirmada",
      rotulo: "Perda confirmada",
      ajuda: "Saem do rebanho de vez, sem terem sido vendidos.",
    },
  ],
};

type Pasture = { id: string; name: string };
const SEM_PASTOS: Pasture[] = [];

export default function StayCloseForm({
  stayId,
  tipo,
  saldoAberto,
  descricao,
  pastures,
}: {
  stayId: string;
  tipo: HerdStayType;
  saldoAberto: number;
  descricao: string;
  /**
   * Pastos da fazenda desta estadia, já filtrados pela página (§18 do
   * documento de Confinamento, que a decisão do usuário estendeu aos SEIS
   * tipos de estadia). Opcional porque `/rebanho` ainda não os passa: sem a
   * lista, o campo simplesmente não aparece, como antes.
   */
  pastures?: Pasture[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Sem `?? SEM_DESTINOS`: o mapa cobre o enum inteiro por tipo, então não
  // existe mais o caso "tipo sem destino" que abria o painel vazio.
  const destinos = DESTINOS_POR_TIPO[tipo];
  const pastosDisponiveis = pastures ?? SEM_PASTOS;
  const err = useErrosDeFormulario(
    destinos.map((d) => d.movement_type).concat("quantity", "value", "pasture_id"),
  );

  const [valores, setValores] = useState<Record<string, string>>({});
  const [valorVenda, setValorVenda] = useState("");
  const [pastureId, setPastureId] = useState("");

  const informado = useMemo(
    () =>
      destinos.reduce((soma, d) => soma + (lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0), 0),
    [destinos, valores],
  );
  const falta = saldoAberto - informado;
  const vendeuAlgo = (lerValorDoCampo(valores.venda ?? "") ?? 0) > 0;
  const voltouParaPasto = (lerValorDoCampo(valores.retorno_estadia ?? "") ?? 0) > 0;

  function limpar() {
    setValores({});
    setValorVenda("");
    setPastureId("");
    err.limparTudo();
  }

  async function submit() {
    // Somar mais do que está na estadia continua recusado (pelo servidor
    // também); somar menos passa a ser válido desde 31/08 e deixa a estadia
    // aberta com o restante (§20).
    if (falta < 0) {
      err.setGlobal(null);
      err.reprovar({
        quantity: `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que as ${saldoAberto.toLocaleString("pt-BR")} que estão na estadia.`,
      });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ id: string; encerrada: boolean; saldo_aberto: number }>(
      `/api/v1/herd/stays/${stayId}/close`,
      {
        destinos: destinos
          .map((d) => ({
            movement_type: d.movement_type,
            quantity: lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0,
            value: d.movement_type === "venda" ? lerValorDoCampo(valorVenda) : null,
            // Pasto de destino é só para quem volta ao pasto (§18): venda,
            // morte e os demais destinos não têm posição de destino para o
            // pasto pousar.
            ...(d.movement_type === "retorno_estadia" ? { pasture_id: pastureId || null } : {}),
          }))
          .filter((d) => d.quantity > 0),
      },
    );
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    aviso.sucesso(
      res.data.encerrada
        ? "Estadia encerrada."
        : `Encerramento parcial registrado. Ainda restam ${res.data.saldo_aberto.toLocaleString("pt-BR")} cabeças na estadia.`,
    );
    setOpen(false);
    limpar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Encerrar
        </Button>
      }
      title="Encerrar estadia"
      description={descricao}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Encerrar"
      submitPendingLabel="Encerrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        Estão na estadia{" "}
        <span className="tabular-nums font-medium text-texto">
          {saldoAberto.toLocaleString("pt-BR")}
        </span>{" "}
        {saldoAberto === 1 ? "cabeça" : "cabeças"}. Diga para onde cada uma foi.
      </p>

      {destinos.map((destino) => (
        <Field
          key={destino.movement_type}
          label={destino.rotulo}
          hint={destino.ajuda}
          id={destino.movement_type}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="cabeças"
              value={valores[destino.movement_type] ?? ""}
              onValueChange={(v) => {
                setValores((atuais) => ({ ...atuais, [destino.movement_type]: v }));
                err.limparCampo("quantity");
              }}
            />
          )}
        </Field>
      ))}

      {voltouParaPasto && pastosDisponiveis.length > 0 && (
        <Field
          label="Pasto de destino"
          hint="Opcional. Para onde os que voltaram foram."
          id="pasture_id"
        >
          {({ id, ...aria }) => (
            <Select value={pastureId} onValueChange={setPastureId}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto informado" />
              </SelectTrigger>
              <SelectContent>
                {pastosDisponiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {vendeuAlgo && (
        <Field
          label="Valor recebido pelos vendidos, em R$"
          hint="Opcional. Gera a receita no Financeiro."
          id="value"
          error={err.erros.value}
        >
          {({ id, ...aria }) => (
            <MoneyInput id={id} {...aria} value={valorVenda} onValueChange={setValorVenda} />
          )}
        </Field>
      )}

      {/* O placar da soma: aparece enquanto se digita, para a recusa do
          servidor nunca ser surpresa ao tocar em salvar. Somar menos que o
          saldo é válido (encerramento parcial, §20): só somar mais é erro. */}
      <p
        className={
          falta < 0
            ? "text-sm text-perigo-tinta"
            : falta === 0
              ? "text-sm font-medium text-sucesso-tinta"
              : "text-sm text-texto-secundario"
        }
        id="quantity-placar"
      >
        {falta === 0
          ? "A conta fecha: os destinos somam tudo que está na estadia."
          : falta > 0
            ? `Encerramento parcial: ${falta.toLocaleString("pt-BR")} cabeças continuam na estadia depois de salvar.`
            : `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que há na estadia.`}
      </p>
      {err.erros.quantity && (
        <p role="alert" className="text-sm text-perigo-tinta">
          {err.erros.quantity}
        </p>
      )}
    </FormSheet>
  );
}
