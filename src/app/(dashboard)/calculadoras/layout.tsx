import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { SoDaLojaProvider } from "./_components/so-da-loja";

export default async function CalculadorasLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const soDaLoja = user ? (await papelDoEmporio(await getTenantDb(), user)).soDaLoja : false;
  return <SoDaLojaProvider valor={soDaLoja}>{children}</SoDaLojaProvider>;
}
