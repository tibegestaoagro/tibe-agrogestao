"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { UNIDADE_BASE_SUFIXO } from "./formato";

/**
 * "Nova transferência" (F2b, Q19, Q31, Q73 a Q76).
 *
 * A `operation_key` nasce com o primeiro envio e só troca depois de uma
 * transferência gravada: reenviar depois de uma falha de rede devolve a mesma
 * transferência em vez de mandar a mercadoria duas vezes.
 */

export type ProdutoParaTransferencia = {
  id: string;
  name: string;
  base_unit: string;
  /** O produto separa lacrado de avulso (Q57). */
  separa: boolean;
  /** Apresentações fechadas ativas. */
  fechadas: { id: string; name: string }[];
};

type Modo = "lacrado" | "avulso";
type ItemLinha = { key: number; produto: string; modo: Modo; apresentacao: string; qtd: string };

// Ordem visual, de cima para baixo.
const ORDEM = ["origin_establishment_id", "destination_establishment_id", "items", "notes"] as const;
type Campo = (typeof ORDEM)[number];

export function TransferenciaForm({
  origens,
  destinos,
  produtos,
}: {
  origens: { id: string; name: string }[];
  destinos: { id: string; name: string }[];
  produtos: ProdutoParaTransferencia[];
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "transf");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<string | null>(null);
  const contador = useRef(1);
  const proximo = () => {
    contador.current += 1;
    return contador.current;
  };

  const novoItem = (): ItemLinha => ({ key: proximo(), produto: "", modo: "lacrado", apresentacao: "", qtd: "" });
  const [origem, setOrigem] = useState(origens.length === 1 ? origens[0].id : "");
  const [destino, setDestino] = useState("");
  const [itens, setItens] = useState<ItemLinha[]>(() => [
    { key: 1, produto: "", modo: "lacrado", apresentacao: "", qtd: "" },
  ]);
  const [obs, setObs] = useState("");

  function reiniciar() {
    setOrigem(origens.length === 1 ? origens[0].id : "");
    setDestino("");
    setItens([novoItem()]);
    setObs("");
    err.limparTudo();
  }

  function atualizarItem(key: number, parte: Partial<ItemLinha>) {
    setItens((lista) => lista.map((i) => (i.key === key ? { ...i, ...parte } : i)));
    err.limparCampo("items");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!origem) novos.origin_establishment_id = "Escolha a loja de origem.";
    if (!destino) novos.destination_establishment_id = "Escolha a loja de destino.";
    else if (destino === origem) novos.destination_establishment_id = "A origem e o destino devem ser lojas diferentes.";

    const itensApi: {
      emporio_product_id: string;
      presentation_id?: string;
      packages?: number;
      quantity?: number;
    }[] = [];
    for (const i of itens) {
      const prod = produtos.find((p) => p.id === i.produto);
      const q = lerNumeroBr(i.qtd);
      if (!prod || q === null || q <= 0) {
        novos.items = "Cada item precisa de produto e quantidade maior que zero.";
        break;
      }
      const lacrado = prod.separa && prod.fechadas.length > 0 && i.modo === "lacrado";
      if (lacrado) {
        const apresentacao = i.apresentacao || prod.fechadas[0].id;
        if (!Number.isInteger(q)) {
          novos.items = "Embalagem lacrada se conta em número inteiro.";
          break;
        }
        itensApi.push({ emporio_product_id: prod.id, presentation_id: apresentacao, packages: q });
      } else {
        if (prod.base_unit === "unidade" && !Number.isInteger(q)) {
          novos.items = "Produto vendido por unidade só aceita quantidade inteira.";
          break;
        }
        itensApi.push({ emporio_product_id: prod.id, quantity: q });
      }
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/transfers", {
      operation_key: (chave.current ??= crypto.randomUUID()),
      origin_establishment_id: origem,
      destination_establishment_id: destino,
      items: itensApi,
      notes: obs.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Nova transferência</Button>}
      title="Nova transferência"
      description="A mercadoria sai da origem agora e só entra no destino quando alguém confirmar o recebimento."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Depois de uma falha o rascunho fica, para a pessoa corrigir e reenviar com a mesma chave.
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Enviar transferência"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Loja de origem" required id={err.idDe("origin_establishment_id")} error={err.erros.origin_establishment_id}>
        {({ id, ...aria }) => (
          <Select
            value={origem}
            onValueChange={(v) => {
              setOrigem(v);
              if (v === destino) setDestino("");
              err.limparCampo("origin_establishment_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {origens.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Loja de destino"
        required
        id={err.idDe("destination_establishment_id")}
        error={err.erros.destination_establishment_id}
      >
        {({ id, ...aria }) => (
          <Select
            value={destino}
            onValueChange={(v) => {
              setDestino(v);
              err.limparCampo("destination_establishment_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {destinos
                .filter((l) => l.id !== origem)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Itens" required id={err.idDe("items")} error={err.erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            {itens.map((item, n) => {
              const prod = produtos.find((p) => p.id === item.produto);
              const sufixo = prod ? (UNIDADE_BASE_SUFIXO[prod.base_unit] ?? prod.base_unit) : "";
              const separa = !!prod && prod.separa && prod.fechadas.length > 0;
              const lacrado = separa && item.modo === "lacrado";
              return (
                <div key={item.key} className="space-y-2 rounded-lg border border-borda p-3">
                  <Select
                    value={item.produto}
                    onValueChange={(v) => {
                      const novo = produtos.find((p) => p.id === v);
                      atualizarItem(item.key, {
                        produto: v,
                        modo: "lacrado",
                        apresentacao: novo?.fechadas[0]?.id ?? "",
                        qtd: "",
                      });
                    }}
                  >
                    <SelectTrigger aria-label={`Produto do item ${n + 1}`}>
                      <SelectValue placeholder="Produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {separa && (
                    <Select
                      value={item.modo}
                      onValueChange={(v) => atualizarItem(item.key, { modo: v === "avulso" ? "avulso" : "lacrado", qtd: "" })}
                    >
                      <SelectTrigger aria-label={`Estado do item ${n + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lacrado">Lacrado (embalagens fechadas)</SelectItem>
                        <SelectItem value="avulso">Avulso (em {sufixo})</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {lacrado && prod && prod.fechadas.length > 1 && (
                    <Select
                      value={item.apresentacao || prod.fechadas[0].id}
                      onValueChange={(v) => atualizarItem(item.key, { apresentacao: v })}
                    >
                      <SelectTrigger aria-label={`Apresentação do item ${n + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {prod.fechadas.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {prod && (
                    <MoneyInput
                      kind="quantidade"
                      unit={lacrado ? "emb." : sufixo}
                      aria-label={`Quantidade do item ${n + 1}`}
                      placeholder={lacrado ? "Embalagens" : `Quantidade em ${sufixo}`}
                      value={item.qtd}
                      onValueChange={(v) => atualizarItem(item.key, { qtd: v })}
                    />
                  )}

                  {itens.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setItens((l) => l.filter((x) => x.key !== item.key));
                        err.limparCampo("items");
                      }}
                    >
                      Remover item
                    </Button>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setItens((l) => [...l, novoItem()])}>
              Adicionar item
            </Button>
          </div>
        )}
      </Field>

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              err.limparCampo("notes");
            }}
            placeholder="Ex: segue no caminhão da tarde"
          />
        )}
      </Field>
    </FormSheet>
  );
}
