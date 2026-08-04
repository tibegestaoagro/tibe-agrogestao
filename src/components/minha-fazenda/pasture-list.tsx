"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/client-api";
import PastureForm from "@/components/minha-fazenda/pasture-form";

type Pasture = { id: string; name: string; area_hectares: number | null };

export default function PastureList({
  propertyId,
  pastures,
  canWrite,
}: {
  propertyId: string;
  pastures: Pasture[];
  canWrite: boolean;
}) {
  const router = useRouter();

  async function archive(id: string) {
    await apiPost(`/api/v1/pastures/${id}/archive`);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-medium text-gray-700">Pastos</h2>
        {canWrite && (
          <PastureForm
            propertyId={propertyId}
            trigger={
              <Button variant="outline" size="sm">
                + Novo pasto
              </Button>
            }
          />
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Tamanho</TableHead>
            {canWrite && <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pastures.length === 0 && (
            <TableRow>
              <TableCell colSpan={canWrite ? 3 : 2} className="py-6 text-center text-gray-500">
                Nenhum pasto cadastrado.
              </TableCell>
            </TableRow>
          )}
          {pastures.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.area_hectares != null ? `${p.area_hectares} ha` : "não informado"}</TableCell>
              {canWrite && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <PastureForm
                      propertyId={propertyId}
                      pasture={p}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      }
                    />
                    <Button variant="ghost" size="sm" onClick={() => archive(p.id)}>
                      Desativar
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
