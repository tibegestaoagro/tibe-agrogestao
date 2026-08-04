"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/client-api";

export default function ArchiveFazendaButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();

  async function archive() {
    if (!confirm("Arquivar esta fazenda? Os dados são preservados, mas ela deixa de aparecer nas listas ativas.")) {
      return;
    }
    await apiPost(`/api/v1/properties/${propertyId}/archive`);
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={archive}>
      Arquivar fazenda
    </Button>
  );
}
