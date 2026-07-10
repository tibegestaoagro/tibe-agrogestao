const STYLES: Record<string, string> = {
  trial: "bg-blue-500/15 text-blue-300",
  active: "bg-emerald-500/15 text-emerald-300",
  overdue: "bg-amber-500/15 text-amber-300",
  canceled: "bg-red-500/15 text-red-300",
};

const LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Ativo",
  overdue: "Em atraso",
  canceled: "Cancelado",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? "bg-gray-500/15 text-gray-300"}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
