import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerInicioAction } from "@/lib/actions/emporio-inicio";
import { primeirosPassosAction } from "@/lib/actions/emporio-primeiros-passos";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { caixaEntraEmVender } from "@/lib/emporio/menu";
import { CabecalhoDaTela } from "./_components/cabecalho-da-tela";
import { InicioAvisos } from "./_components/inicio-avisos";
import { InicioNumeros } from "./_components/inicio-numeros";
import { InicioAtalhos } from "./_components/inicio-atalhos";
import { InicioPrimeirosPassos } from "./_components/inicio-primeiros-passos";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Ordem do Início: Estatísticas, Produtos, Estoque, Nova compra, A receber. */
const ATALHOS = [
  { href: "/emporio/relatorios", rotulo: "Estatísticas", pagina: "/emporio/relatorios" },
  { href: "/emporio/produtos", rotulo: "Produtos", pagina: "/emporio/produtos" },
  { href: "/emporio/estoque", rotulo: "Estoque", pagina: "/emporio/estoque" },
  { href: "/emporio/compras?nova=1", rotulo: "Nova compra", pagina: "/emporio/compras" },
  { href: "/emporio/financeiro/receber", rotulo: "A receber", pagina: "/emporio/financeiro" },
] as const;

/** Hora e mês de hoje no fuso de São Paulo (o servidor roda em UTC). */
function agoraEmSaoPaulo(): { hora: number; mesAnterior: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    month: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const mes = Number(partes.find((p) => p.type === "month")?.value ?? "1");
  return { hora, mesAnterior: MESES[(mes + 10) % 12] };
}

function saudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Meu Empório: o Início. O que precisa de você, os números do dia e os atalhos.
 *
 * `requireFeaturePage` devolve 404 quando o recurso não é visível para o
 * usuário, como se a rota não existisse. O Caixa não tem Início: entra em Vender.
 */
export default async function EmporioPage() {
  const user = await requireFeaturePage("emporio");
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (caixaEntraEmVender(papel)) redirect("/emporio/vender");

  const inicio = await lerInicioAction(db, user);
  const { hora, mesAnterior } = agoraEmSaoPaulo();
  const primeiroNome = user.name?.trim().split(/\s+/)[0];
  const titulo = primeiroNome ? `${saudacao(hora)}, ${primeiroNome}` : saudacao(hora);

  const atalhos = ATALHOS.filter((a) => veAPagina(papel, a.pagina)).map(({ href, rotulo }) => ({ href, rotulo }));

  const passos = pode(papel, "gestor_da_loja") ? await primeirosPassosAction(db, user) : null;
  // O aviso de loja sem Gestor (Q132) é recomendado e entra mesmo com os essenciais prontos.
  const pendenciasPorLoja = passos?.ok
    ? passos.data.establishments.filter((l) => l.sem_gestor || (!passos.data.complete && l.steps.some((s) => !s.done)))
    : [];

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo={titulo}
        ajuda="O que precisa de você hoje nas suas lojas, os números do dia e os atalhos mais usados."
      />

      {inicio.ok ? (
        <>
          <InicioAvisos avisos={inicio.data.avisos} />
          <InicioNumeros numeros={inicio.data.numeros} mesAnterior={mesAnterior} />
        </>
      ) : (
        <p className="rounded-lg bg-superficie-afundada px-4 py-3 text-sm text-texto-secundario">{inicio.message}</p>
      )}

      <InicioAtalhos atalhos={atalhos} />
      <InicioPrimeirosPassos lojas={pendenciasPorLoja} />
    </div>
  );
}
