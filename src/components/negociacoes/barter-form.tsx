"use client";

import { useState } from "react";
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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { HERD_CATEGORIES } from "@/lib/herd/categories";

/**
 * Registrar uma permuta (Módulo 31, missão 4, §12).
 *
 * O formulário faz as três perguntas do §12.2, nesta ordem: o que saiu da
 * fazenda, o que entrou, e houve diferença em dinheiro. Cada lado escolhe um
 * tipo, e só os campos daquele tipo aparecem.
 *
 * "Dinheiro" NÃO é uma opção de lado, embora o §12.2 o liste nos dois: dinheiro
 * num lado É a diferença, dita de outro jeito, e ter as duas portas para a
 * mesma coisa faria o produtor informar o valor duas vezes.
 *
 * Importa `@/lib/herd/categories` (módulo puro) e NUNCA a action: é a mesma
 * armadilha de bundle já documentada no `movement-form`.
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };
type Machine = { id: string; name: string };
type Produto = { id: string; name: string; unit: string };

const TIPOS = [
  { id: "animais", label: "Animais" },
  { id: "produtos", label: "Produtos do estoque" },
  { id: "maquina", label: "Máquina ou implemento" },
  { id: "servico", label: "Serviço" },
  { id: "outro", label: "Outro" },
] as const;

type Tipo = (typeof TIPOS)[number]["id"];

/** Os dois tipos que não têm área no Tibé e viram texto (decisão 4 da spec). */
function ehDescricao(tipo: Tipo | ""): boolean {
  return tipo === "servico" || tipo === "outro";
}

const ORDEM = [
  "property_id",
  "entregue",
  "recebido",
  "category_id",
  "quantity",
  "product_id",
  "machine_id",
  "name",
  "type",
  "amount",
  "outro_destino",
] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function BarterForm({
  properties,
  pastures,
  machines,
  produtos,
  defaultPropertyId,
}: {
  properties: Property[];
  pastures: Pasture[];
  machines: Machine[];
  produtos: Produto[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [pastureId, setPastureId] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje());
  const [contato, setContato] = useState("");
  const [notes, setNotes] = useState("");

  // Lado entregue
  const [tipoSaiu, setTipoSaiu] = useState<Tipo | "">("");
  const [catSaiu, setCatSaiu] = useState("");
  const [qtdSaiu, setQtdSaiu] = useState("1");
  const [prodSaiu, setProdSaiu] = useState("");
  const [maqSaiu, setMaqSaiu] = useState("");
  const [textoSaiu, setTextoSaiu] = useState("");

  // Lado recebido
  const [tipoEntrou, setTipoEntrou] = useState<Tipo | "">("");
  const [catEntrou, setCatEntrou] = useState("");
  const [qtdEntrou, setQtdEntrou] = useState("1");
  const [prodEntrou, setProdEntrou] = useState("");
  const [maqNome, setMaqNome] = useState("");
  const [maqTipo, setMaqTipo] = useState("");
  const [maqMarca, setMaqMarca] = useState("");
  const [textoEntrou, setTextoEntrou] = useState("");

  // A diferença
  const [direcao, setDirecao] = useState<"nao" | "paguei" | "recebi">("nao");
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState(true);

  const pastosDaFazenda = pastures.filter((p) => p.property_id === propertyId);
  const temDiferenca = direcao !== "nao";
  const avisoSemArea = ehDescricao(tipoSaiu) || ehDescricao(tipoEntrou);

  function limpar() {
    setPastureId("");
    setOccurredAt(hoje());
    setContato("");
    setNotes("");
    setTipoSaiu("");
    setCatSaiu("");
    setQtdSaiu("1");
    setProdSaiu("");
    setMaqSaiu("");
    setTextoSaiu("");
    setTipoEntrou("");
    setCatEntrou("");
    setQtdEntrou("1");
    setProdEntrou("");
    setMaqNome("");
    setMaqTipo("");
    setMaqMarca("");
    setTextoEntrou("");
    setDirecao("nao");
    setValor("");
    setPago(true);
    err.limparTudo();
  }

  function montarEntregue() {
    if (tipoSaiu === "animais") {
      return {
        kind: "animais",
        category_id: catSaiu,
        quantity: lerValorDoCampo(qtdSaiu) ?? 0,
        pasture_id: pastureId || null,
      };
    }
    if (tipoSaiu === "produtos") {
      return { kind: "produtos", product_id: prodSaiu, quantity: lerValorDoCampo(qtdSaiu) ?? 0 };
    }
    if (tipoSaiu === "maquina") return { kind: "maquina", machine_id: maqSaiu };
    return { kind: "descricao", texto: textoSaiu.trim() };
  }

  function montarRecebido() {
    if (tipoEntrou === "animais") {
      return {
        kind: "animais",
        category_id: catEntrou,
        quantity: lerValorDoCampo(qtdEntrou) ?? 0,
        pasture_id: pastureId || null,
      };
    }
    if (tipoEntrou === "produtos") {
      return {
        kind: "produtos",
        product_id: prodEntrou,
        quantity: lerValorDoCampo(qtdEntrou) ?? 0,
      };
    }
    if (tipoEntrou === "maquina") {
      return {
        kind: "maquina",
        name: maqNome.trim(),
        type: maqTipo.trim(),
        brand: maqMarca.trim() || null,
      };
    }
    return { kind: "descricao", texto: textoEntrou.trim() };
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!tipoSaiu) novos.entregue = "Escolha o que saiu da fazenda.";
    if (!tipoEntrou) novos.recebido = "Escolha o que entrou na fazenda.";
    if (tipoSaiu === "animais" && !catSaiu) novos.category_id = "Escolha a categoria que saiu.";
    if (tipoEntrou === "animais" && !catEntrou) novos.category_id = "Escolha a categoria que entrou.";
    if (tipoSaiu === "produtos" && !prodSaiu) novos.product_id = "Escolha o produto que saiu.";
    if (tipoEntrou === "produtos" && !prodEntrou) novos.product_id = "Escolha o produto que entrou.";
    if (tipoSaiu === "maquina" && !maqSaiu) novos.machine_id = "Escolha a máquina entregue.";
    if (tipoEntrou === "maquina" && !maqNome.trim()) novos.name = "Informe o nome da máquina.";
    if (tipoEntrou === "maquina" && !maqTipo.trim()) novos.type = "Informe o tipo da máquina.";
    if (ehDescricao(tipoSaiu) && !textoSaiu.trim()) novos.entregue = "Descreva o que você entregou.";
    if (ehDescricao(tipoEntrou) && !textoEntrou.trim()) {
      novos.recebido = "Descreva o que você recebeu.";
    }
    if (temDiferenca && (lerValorDoCampo(valor) ?? 0) <= 0) {
      novos.amount = "Informe o valor da diferença.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/negotiations/barters", {
      property_id: propertyId,
      entregue: montarEntregue(),
      recebido: montarRecebido(),
      diferenca: temDiferenca
        ? { direcao, amount: lerValorDoCampo(valor) ?? 0 }
        : null,
      contact_name: contato.trim() || null,
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : null,
      pago: temDiferenca ? pago : false,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    limpar();
    router.refresh();
  }

  /** Os campos de um lado, que mudam conforme o tipo escolhido. */
  function camposDoLado(lado: "saiu" | "entrou") {
    const tipo = lado === "saiu" ? tipoSaiu : tipoEntrou;
    if (tipo === "animais") {
      return (
        <>
          <Field label="Categoria" required id="category_id" error={err.erros.category_id}>
            {({ id, ...aria }) => (
              <Select
                value={lado === "saiu" ? catSaiu : catEntrou}
                onValueChange={(v) => {
                  if (lado === "saiu") setCatSaiu(v);
                  else setCatEntrou(v);
                  err.limparCampo("category_id");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {HERD_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Quantidade de cabeças" required id="quantity" error={err.erros.quantity}>
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit="cabeças"
                value={lado === "saiu" ? qtdSaiu : qtdEntrou}
                onValueChange={(v) => {
                  if (lado === "saiu") setQtdSaiu(v);
                  else setQtdEntrou(v);
                  err.limparCampo("quantity");
                }}
              />
            )}
          </Field>
        </>
      );
    }

    if (tipo === "produtos") {
      return (
        <>
          <Field label="Produto" required id="product_id" error={err.erros.product_id}>
            {({ id, ...aria }) => (
              <Select
                value={lado === "saiu" ? prodSaiu : prodEntrou}
                onValueChange={(v) => {
                  if (lado === "saiu") setProdSaiu(v);
                  else setProdEntrou(v);
                  err.limparCampo("product_id");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Escolha o produto" />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Quantidade" required id="quantity" error={err.erros.quantity}>
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                value={lado === "saiu" ? qtdSaiu : qtdEntrou}
                onValueChange={(v) => {
                  if (lado === "saiu") setQtdSaiu(v);
                  else setQtdEntrou(v);
                  err.limparCampo("quantity");
                }}
              />
            )}
          </Field>
        </>
      );
    }

    if (tipo === "maquina" && lado === "saiu") {
      // A máquina que SAI é escolhida no cadastro, nunca digitada: ela já
      // existe, e digitar o nome criaria uma segunda máquina para a mesma.
      return (
        <Field
          label="Qual máquina você entregou"
          required
          id="machine_id"
          error={err.erros.machine_id}
        >
          {({ id, ...aria }) => (
            <Select
              value={maqSaiu}
              onValueChange={(v) => {
                setMaqSaiu(v);
                err.limparCampo("machine_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha a máquina" />
              </SelectTrigger>
              <SelectContent>
                {machines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      );
    }

    if (tipo === "maquina") {
      return (
        <>
          <Field label="Nome da máquina" required id="name" error={err.erros.name}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                placeholder="Ex: Trator John Deere 6110"
                value={maqNome}
                onChange={(e) => {
                  setMaqNome(e.target.value);
                  err.limparCampo("name");
                }}
              />
            )}
          </Field>
          <Field label="Tipo" required id="type" error={err.erros.type}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                placeholder="Ex: Trator"
                value={maqTipo}
                onChange={(e) => {
                  setMaqTipo(e.target.value);
                  err.limparCampo("type");
                }}
              />
            )}
          </Field>
          <Field label="Marca" id="marca">
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                value={maqMarca}
                onChange={(e) => setMaqMarca(e.target.value)}
              />
            )}
          </Field>
        </>
      );
    }

    if (ehDescricao(tipo)) {
      return (
        <Field
          label={tipo === "servico" ? "Qual serviço" : "O que foi"}
          required
          id={lado === "saiu" ? "entregue" : "recebido"}
          error={lado === "saiu" ? err.erros.entregue : err.erros.recebido}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              placeholder={tipo === "servico" ? "Ex: construção de 500m de cerca" : "Descreva"}
              value={lado === "saiu" ? textoSaiu : textoEntrou}
              onChange={(e) => {
                if (lado === "saiu") setTextoSaiu(e.target.value);
                else setTextoEntrou(e.target.value);
                err.limparCampo(lado === "saiu" ? "entregue" : "recebido");
              }}
            />
          )}
        </Field>
      );
    }

    return null;
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Registrar permuta</Button>}
      title="Permuta"
      description="Você entregou uma coisa e recebeu outra. O Tibé atualiza rebanho, estoque, máquinas e financeiro de uma vez."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar permuta"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Fazenda" required id="property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              setPastureId("");
              err.limparCampo("property_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a fazenda" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <div className="rounded-md border border-borda p-3">
        <p className="text-sm font-medium text-texto">O que saiu da fazenda</p>
        <div className="mt-2 space-y-3">
          <Field label="Tipo" required id="entregue" error={err.erros.entregue}>
            {({ id, ...aria }) => (
              <Select
                value={tipoSaiu}
                onValueChange={(v) => {
                  setTipoSaiu(v as Tipo);
                  err.limparCampo("entregue");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {camposDoLado("saiu")}
        </div>
      </div>

      <div className="rounded-md border border-borda p-3">
        <p className="text-sm font-medium text-texto">O que entrou na fazenda</p>
        <div className="mt-2 space-y-3">
          <Field label="Tipo" required id="recebido" error={err.erros.recebido}>
            {({ id, ...aria }) => (
              <Select
                value={tipoEntrou}
                onValueChange={(v) => {
                  setTipoEntrou(v as Tipo);
                  err.limparCampo("recebido");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {camposDoLado("entrou")}
        </div>
      </div>

      {/* A frase da decisão 4 da spec: o aviso é o que tira o silêncio de um
          lado que o Tibé não tem onde guardar. */}
      {avisoSemArea && (
        <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
          Serviço e &quot;outro&quot; <span className="font-medium text-texto">não atualizam
          nenhuma área do Tibé</span>. O que você entregou sai do rebanho ou do estoque
          normalmente; esse lado fica registrado como descrição.
        </p>
      )}

      {(tipoSaiu === "animais" || tipoEntrou === "animais") && pastosDaFazenda.length > 0 && (
        <Field label="Pasto" hint="De onde os animais saem, ou para onde vão. Opcional." id="pasture_id">
          {({ id, ...aria }) => (
            <Select value={pastureId} onValueChange={setPastureId}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto informado" />
              </SelectTrigger>
              <SelectContent>
                {pastosDaFazenda.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <div className="rounded-md border border-borda p-3">
        <p className="text-sm font-medium text-texto">Houve diferença em dinheiro?</p>
        <div className="mt-2 space-y-3">
          <Field label="Diferença" id="direcao">
            {({ id, ...aria }) => (
              <Select value={direcao} onValueChange={(v) => setDirecao(v as typeof direcao)}>
                <SelectTrigger id={id} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não houve</SelectItem>
                  <SelectItem value="paguei">Eu paguei a diferença</SelectItem>
                  <SelectItem value="recebi">Eu recebi a diferença</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>

          {temDiferenca && (
            <>
              <Field label="Valor da diferença, em R$" required id="amount" error={err.erros.amount}>
                {({ id, ...aria }) => (
                  <MoneyInput
                    id={id}
                    {...aria}
                    value={valor}
                    onValueChange={(v) => {
                      setValor(v);
                      err.limparCampo("amount");
                    }}
                  />
                )}
              </Field>
              <Field label="Já foi pago?" id="pago">
                {({ id, ...aria }) => (
                  <Select
                    value={pago ? "sim" : "nao"}
                    onValueChange={(v) => setPago(v === "sim")}
                  >
                    <SelectTrigger id={id} {...aria}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim, já foi</SelectItem>
                      <SelectItem value="nao">Não, fica em aberto</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </>
          )}
        </div>
      </div>

      <Field label="Com quem foi a troca" id="contato">
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={contato} onChange={(e) => setContato(e.target.value)} />
        )}
      </Field>

      <Field label="Data" id="occurred_at">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        )}
      </Field>

      <Field label="Observação" id="notes">
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </FormSheet>
  );
}
