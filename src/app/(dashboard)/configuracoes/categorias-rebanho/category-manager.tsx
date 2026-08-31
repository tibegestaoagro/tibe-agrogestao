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

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name"] as const;

/**
 * Gestão de categorias de rebanho (Módulo 25, spec §2.3): renomear,
 * ativar/desativar, adicionar. Sem exclusão: mesmo espírito de
 * Property.archived_at, categoria já usada em lote não pode sumir do
 * histórico.
 */
export default function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Um painel só, compartilhado por criar e renomear: a pergunta é a mesma.
  // Esta página renderiza uma instância única, então o id não precisa de prefixo.
  const err = useErrosDeFormulario(ORDEM);

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
      ? await apiPatch<Category>(`/api/v1/animal-categories/${editing.id}`, { name: name.trim() })
      : await apiPost<Category>("/api/v1/animal-categories", { name: name.trim() });
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
    const res = await apiPatch<Category>(`/api/v1/animal-categories/${category.id}`, {
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
