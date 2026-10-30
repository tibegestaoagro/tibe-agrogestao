import { AlertTriangle, Info, Lightbulb } from "lucide-react";

const ESTILO = {
  dica: { caixa: "border-sucesso-tinta/30 bg-sucesso-suave text-sucesso-tinta", Icone: Lightbulb, titulo: "Dica" },
  atencao: { caixa: "border-atencao-tinta/30 bg-atencao-suave text-atencao-tinta", Icone: AlertTriangle, titulo: "Atenção" },
  saiba: { caixa: "border-info-tinta/30 bg-info-suave text-info-tinta", Icone: Info, titulo: "Bom saber" },
} as const;

/** Caixa de destaque dentro do texto. O título é parte do texto, não só da cor. */
export function Chamada({
  tipo = "saiba",
  children,
}: {
  tipo?: keyof typeof ESTILO;
  children: React.ReactNode;
}) {
  const { caixa, Icone, titulo } = ESTILO[tipo];
  return (
    <aside className={`my-4 flex gap-3 rounded-lg border p-4 text-sm print:break-inside-avoid ${caixa}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{titulo}</p>
        <div className="space-y-2">{children}</div>
      </div>
    </aside>
  );
}
