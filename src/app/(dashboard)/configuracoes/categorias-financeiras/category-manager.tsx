"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

/** Gestão de categorias financeiras (Módulo 28), uma instância por tipo (receita/despesa). */
export default function CategoryManager({
  entryType,
  categories,
}: {
  entryType: EntryType;
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setError(null);
    setOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!name.trim()) return setError("Informe o nome da categoria.");
    setLoading(true);
    setError(null);
    const res = editing
      ? await apiPatch<Category>(`/api/v1/financial-categories/${editing.id}`, { name })
      : await apiPost<Category>("/api/v1/financial-categories", { name, entry_type: entryType });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  async function toggleActive(category: Category) {
    setTogglingId(category.id);
    await apiPatch<Category>(`/api/v1/financial-categories/${category.id}`, {
      active: !category.active,
    });
    setTogglingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Sheet open={open} onOpenChange={(v) => (v ? openCreate() : setOpen(false))}>
          <SheetTrigger asChild>
            <Button>Nova categoria</Button>
          </SheetTrigger>
          <SheetContent title={editing ? "Renomear categoria" : "Nova categoria"}>
            <SheetHeader>
              <SheetTitle>{editing ? "Renomear categoria" : "Nova categoria"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor={`cat-name-${entryType}`}>Nome *</Label>
                <Input id={`cat-name-${entryType}`} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <Button onClick={submit} disabled={loading} className="w-full">
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
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
                <TableCell colSpan={3} className="py-4 text-center text-gray-500">
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
