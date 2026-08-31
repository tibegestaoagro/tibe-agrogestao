"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { apiPost, apiPatch } from "@/lib/client-api";

type Category = { id: string; name: string; active: boolean };
type EntryType = "income" | "expense";

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name"] as const;

/** Gestão de categorias financeiras (Módulo 28), uma instância por tipo (receita/despesa). */
export default function CategoryManager({
  entryType,
  categories,
}: {
  entryType: EntryType;
  categories: Category[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  /**
   * `prefixoDeId` porque a página de categorias financeiras renderiza DOIS
   * destes, um para receita e outro para despesa. Sem ele os dois campos de
   * nome teriam `id="name"` no mesmo DOM.
   *
   * Um painel só serve criar e renomear (é a mesma pergunta, "qual o nome"),
   * então não há campo repetido por linha da tabela.
   */
  const err = useErrosDeFormulario(ORDEM, entryType);

  function openCreate() {
    setEditing(null);
    setName("");
    err.limparTudo();
    setOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    err.limparTudo();
    setOpen(true);
  }

  async function submit() {
    if (!name.trim()) {
      err.setGlobal(null);
      err.reprovar({ name: "Informe o nome da categoria." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = editing
      ? await apiPatch<Category>(`/api/v1/financial-categories/${editing.id}`, {
          name: name.trim(),
        })
      : await apiPost<Category>("/api/v1/financial-categories", {
          name: name.trim(),
          entry_type: entryType,
        });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function toggleActive(category: Category) {
    setTogglingId(category.id);
    const res = await apiPatch<Category>(`/api/v1/financial-categories/${category.id}`, {
      active: !category.active,
    });
    setTogglingId(null);
    // A recusa aqui era ENGOLIDA: o botão voltava ao normal, o selo continuava
    // igual, e ninguém sabia se tinha desativado. A trava A não pegou porque
    // ela olha o arquivo inteiro, e o arquivo já tratava a recusa do painel.
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(category.active ? "Categoria desativada." : "Categoria ativada.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <FormSheet
          trigger={<Button onClick={openCreate}>Nova categoria</Button>}
          title={editing ? "Renomear categoria" : "Nova categoria"}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) err.limparTudo();
          }}
          onSubmit={submit}
          submitLabel="Salvar"
          pending={loading}
          error={err.global}
          focarCampoId={err.focarCampoId}
          tentativa={err.tentativa}
        >
          <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  err.limparCampo("name");
                }}
              />
            )}
          </Field>
        </FormSheet>
      </div>

      <div className="rounded-lg border border-borda bg-superficie">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-4 text-center text-texto-secundario">
                  Nenhuma categoria cadastrada.
                </TableCell>
              </TableRow>
            )}
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant={c.active ? "green" : "gray"}>
                    {c.active ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="outline" onClick={() => openEdit(c)}>
                    Renomear
                  </Button>
                  <Button
                    variant="outline"
                    disabled={togglingId === c.id}
                    onClick={() => toggleActive(c)}
                  >
                    {c.active ? "Desativar" : "Ativar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
