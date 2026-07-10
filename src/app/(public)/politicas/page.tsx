import { redirect } from "next/navigation";

/** /politicas (spec 5.10 usa os caminhos completos abaixo). */
export default function PoliticasPage() {
  redirect("/politicas/privacidade");
}
