import { createClient } from "@/lib/supabase/server";
import { RateiosExtraordinariosManager } from "@/components/admin/rateios-extraordinarios/rateios-extraordinarios-manager";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";

type DespesaExtraordinariaRow = Omit<DespesaExtraordinaria, "unidade_ids"> & {
  despesa_extraordinaria_unidades: { unidade_id: string }[];
};

export default async function RateiosExtraordinariosPage() {
  const supabase = await createClient();

  const [{ data: despesas, error: despesasError }, { data: unidades, error: unidadesError }] =
    await Promise.all([
      supabase
        .from("despesas_extraordinarias")
        .select(
          "id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, created_at, despesa_extraordinaria_unidades(unidade_id)",
        )
        .order("data_vencimento", { ascending: false })
        .returns<DespesaExtraordinariaRow[]>(),
      supabase
        .from("unidades")
        .select("id, identificacao, proprietario_id, created_at, proprietario:proprietarios(id, nome)")
        .order("identificacao", { ascending: true })
        .returns<Unidade[]>(),
    ]);

  if (despesasError || unidadesError) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar dados: {despesasError?.message ?? unidadesError?.message}
      </p>
    );
  }

  const despesasComUnidades: DespesaExtraordinaria[] = (despesas ?? []).map(
    ({ despesa_extraordinaria_unidades, ...despesa }) => ({
      ...despesa,
      unidade_ids: despesa_extraordinaria_unidades.map((u) => u.unidade_id),
    }),
  );

  return <RateiosExtraordinariosManager despesas={despesasComUnidades} unidades={unidades ?? []} />;
}
