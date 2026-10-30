import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EstabelecimentoForm } from "../_components/estabelecimento-form";
import { VinculosForm } from "../_components/vinculos-form";
import { ArquivarBotao } from "../_components/arquivar-botao";

export default async function EstabelecimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { arquivados } = await searchParams;
  const mostrarArquivados = arquivados === "1";
  const db = await getTenantDb();
  // F6b: criar, arquivar e definir a equipe da loja são da conta; editar os dados é do Gestor da loja.
  const papel = await papelDoEmporio(db, user);
  const podeEscrever = pode(papel, "conta");
  const podeEditarAlguma = pode(papel, "gestor_da_loja");
  const [res, usuarios] = await Promise.all([
    listarEstabelecimentosAction(db, user, { incluir_arquivados: mostrarArquivados }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const lojas = res.ok ? res.data : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Estabelecimentos</h1>
        </div>
        {podeEscrever && <EstabelecimentoForm usuarios={usuarios} />}
      </header>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={mostrarArquivados ? "/emporio/estabelecimentos" : "/emporio/estabelecimentos?arquivados=1"}>
            {mostrarArquivados ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Link>
        </Button>
      </div>

      {lojas.length === 0 ? (
        <EmptyState titulo="Nenhum estabelecimento cadastrado">
          {podeEscrever
            ? "Cadastre a primeira loja para começar a formar preços."
            : "Peça ao dono ou a um administrador para cadastrar as lojas."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Usuários vinculados</TableHead>
              {podeEditarAlguma && <TableHead>Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lojas.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium text-texto">
                  {l.name}
                  {l.archived_at && (
                    <Badge variant="gray" className="ml-2">
                      Arquivado
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{l.city ?? "-"}</TableCell>
                <TableCell>
                  {l.user_ids.length === 0 ? "Sem vínculo (todos veem)" : l.user_ids.length}
                </TableCell>
                {podeEditarAlguma && (
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {pode(papel, "gestor_da_loja", l.id) && (
                        <EstabelecimentoForm loja={l} usuarios={usuarios} podeLiberarNegativo={podeEscrever} />
                      )}
                      {podeEscrever && (
                        <>
                          <VinculosForm
                            lojaId={l.id}
                            lojaNome={l.name}
                            usuarios={usuarios}
                            marcados={l.user_ids}
                          />
                          <ArquivarBotao
                            url={`/api/v1/emporio/establishments/${l.id}/archive`}
                            arquivado={!!l.archived_at}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
