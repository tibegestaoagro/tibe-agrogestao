"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiGet, apiPost } from "@/lib/client-api";
import { pctBr } from "./formato";
import type { AutorizacaoGuardada } from "./venda-estado";

/**
 * O pedido de autorização do gestor (Q330, Q331): quando o desconto passa do limite da loja e quem vende não
 * é gestor, o gestor digita o PIN dele aqui e o servidor devolve uma autorização curta, que a venda leva junto.
 *
 * Os ids dos campos são os nomes da API (`authorizer_user_id`, `pin`). O PIN vive só no campo, enquanto se
 * digita: some do estado no instante do envio, com a resposta boa ou má. O que a tela guarda é o que o
 * servidor devolveu (`AutorizacaoGuardada`).
 */

const ORDEM = ["authorizer_user_id", "pin"] as const;

type Autorizador = { id: string; name: string };
type Resposta = {
  authorization: string;
  discount_pct: number;
  expires_at: string;
  authorizer: { id: string; name: string };
};

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export function PedidoDeAutorizacao({
  lojaId,
  pct,
  aberto,
  aoMudarAberto,
  aoAutorizar,
  rotulo = "Pedir autorização do gestor",
}: {
  lojaId: string;
  /** O % do desconto da venda, já arredondado para cima em 2 casas: é o teto que o gestor libera. */
  pct: number;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  aoAutorizar: (autorizacao: AutorizacaoGuardada) => void;
  rotulo?: string;
}) {
  const err = useErrosDeFormulario(ORDEM, "autorizacao-gestor");
  const [lista, setLista] = useState<{ lojaId: string; gestores: Autorizador[] } | null>(null);
  const [gestor, setGestor] = useState("");
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);

  // A lista de quem pode autorizar nesta loja é lida ao abrir o painel (e de novo se a loja mudou).
  useEffect(() => {
    if (!aberto || !lojaId) return;
    let vivo = true;
    void apiGet<Autorizador[]>(`/api/v1/emporio/establishments/${encodeURIComponent(lojaId)}/authorizers`).then((res) => {
      if (vivo && res.ok) setLista({ lojaId, gestores: res.data });
    });
    return () => {
      vivo = false;
    };
  }, [aberto, lojaId]);

  const gestores = lista && lista.lojaId === lojaId ? lista.gestores : null;
  // Um gestor só: já vem escolhido.
  const escolhido = gestor && gestores?.some((g) => g.id === gestor) ? gestor : gestores?.length === 1 ? gestores[0].id : "";

  async function enviar() {
    const novos: Partial<Record<(typeof ORDEM)[number], string>> = {};
    if (!escolhido) novos.authorizer_user_id = "Escolha o gestor que vai autorizar.";
    if (!pin.trim()) novos.pin = "Digite o PIN do gestor.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setEnviando(true);
    const res = await apiPost<Resposta>("/api/v1/emporio/discount-authorizations", {
      establishment_id: lojaId,
      authorizer_user_id: escolhido,
      pin: pin.trim(),
      discount_pct: pct,
    });
    setEnviando(false);
    // O PIN sai do estado agora, com a resposta que vier.
    setPin("");
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aoAutorizar({
      authorization: res.data.authorization,
      max_pct: res.data.discount_pct,
      authorizer_name: res.data.authorizer.name,
      expires_at: res.data.expires_at,
      loja: lojaId,
    });
    aoMudarAberto(false);
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline">
          {rotulo}
        </Button>
      }
      title="Autorização do gestor"
      description={`O desconto desta venda é de ${pctBr(pct)}. O gestor digita o PIN dele para liberar.`}
      open={aberto}
      onOpenChange={(o) => {
        aoMudarAberto(o);
        if (!o) {
          setPin("");
          err.limparTudo();
        }
      }}
      onSubmit={enviar}
      submitLabel="Autorizar o desconto"
      submitPendingLabel="Conferindo..."
      pending={enviando}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {gestores !== null && gestores.length === 0 ? (
        <p className="rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
          Nenhum gestor desta loja tem PIN cadastrado. O gestor cadastra o PIN em Minha senha.
        </p>
      ) : (
        <>
          <Field label="Gestor" required id={err.idDe("authorizer_user_id")} error={err.erros.authorizer_user_id}>
            {({ id, ...aria }) => (
              <Select
                value={escolhido}
                onValueChange={(valor) => {
                  // O Radix dispara "" quando o valor some da lista: nunca é escolha de ninguém.
                  if (valor === "") return;
                  setGestor(valor);
                  err.limparCampo("authorizer_user_id");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder={gestores === null ? "Carregando..." : "Escolha o gestor"} />
                </SelectTrigger>
                <SelectContent>
                  {(gestores ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="PIN do gestor" required id={err.idDe("pin")} error={err.erros.pin}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  err.limparCampo("pin");
                }}
              />
            )}
          </Field>
        </>
      )}
    </FormSheet>
  );
}

/** "Desconto autorizado por Fulano até 12%", com a hora em que a autorização vence. */
export function FraseDaAutorizacao({ autorizacao }: { autorizacao: AutorizacaoGuardada }) {
  return (
    <p className="text-sm text-sucesso-tinta">
      Desconto autorizado por <strong>{autorizacao.authorizer_name}</strong> até {pctBr(autorizacao.max_pct)} (vale até{" "}
      {HORA.format(new Date(autorizacao.expires_at))}).
    </p>
  );
}
