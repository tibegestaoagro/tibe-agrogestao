import Link from "next/link";
import {
  Fence, Sprout, Beef, Container, Package, Wheat, Droplet, Box, Leaf, Mountain, User, Tractor,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CALCULADORAS, type IconKey } from "@/lib/calculadoras/catalog";

const ICONS: Record<IconKey, LucideIcon> = {
  fence: Fence,
  sprout: Sprout,
  beef: Beef,
  container: Container,
  package: Package,
  wheat: Wheat,
  droplet: Droplet,
  box: Box,
  leaf: Leaf,
  mountain: Mountain,
  user: User,
  tractor: Tractor,
};

/** Grade "Calculadora Pecuária" embutida no dashboard (briefing, Fase 2). */
export default function CalculadoraGrid() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Calculadora Pecuária</p>
        <Link href="/calculadoras" className="text-sm text-tibe-primary hover:underline">
          Ver todas as ferramentas →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CALCULADORAS.map((c) => {
          const Icon = ICONS[c.icon];
          return (
            <Link
              key={c.href}
              href={c.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-3 text-center transition hover:border-tibe-primary hover:bg-tibe-light"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tibe-primary/10 text-tibe-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-gray-700">{c.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
