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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
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
  const aviso = useAviso();

  /**
   * Desativar um pasto engolia o erro (2026-08-20) e, pior, não pedia
   * confirmação nenhuma, enquanto arquivar a FAZENDA inteira pedia. Duas ações
   * do mesmo tipo, com proteções diferentes, na mesma tela.
   */
  async function archive(id: string) {
    const res = await apiPost(`/api/v1/pastures/${id}/archive`);
    if (res.ok) {
      aviso.sucesso("Pasto desativado.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-medium text-texto-secundario">Pastos</h2>
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
              <TableCell colSpan={canWrite ? 3 : 2} className="py-6 text-center text-texto-discreto">
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
                    <ConfirmDialog
                      gatilho={
                        <Button variant="ghost" size="sm">
                          Desativar
                        </Button>
                      }
                      titulo={`Desativar o pasto ${p.name}?`}
                      descricao="Ele sai da lista e deixa de aparecer como destino nas movimentações. O histórico do que já passou por ele continua."
                      rotuloConfirmar="Desativar pasto"
                      aoConfirmar={() => archive(p.id)}
                    />
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
