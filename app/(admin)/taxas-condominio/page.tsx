import { createClient } from "@/lib/supabase/server";
import { TaxasCondominioManager } from "@/components/admin/taxas-condominio/taxas-condominio-manager";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";

export default async function TaxasCondominioPage() {
  const supabase = await createClient();

  const { data: taxas, error } = await supabase
    .from("taxa_condominio")
    .select(
      "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, ativo, created_at",
    )
    .order("ativo", { ascending: false })
    .order("titulo", { ascending: true })
    .returns<TaxaCondominio[]>();

  if (error) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {error.message}</p>;
  }

  return <TaxasCondominioManager taxas={taxas ?? []} />;
}
