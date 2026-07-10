import Link from "next/link";

const OPTIONS: { value: string; label: string }[] = [
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
];

export default function PeriodSelector({ basePath, current }: { basePath: string; current: string }) {
  return (
    <div className="inline-flex rounded-md border border-gray-700 bg-gray-900 p-1 text-sm">
      {OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={`${basePath}?period=${opt.value}`}
          className={`rounded px-3 py-1 transition ${
            current === opt.value ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
