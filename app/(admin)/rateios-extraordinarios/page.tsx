import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { RateiosExtraordinariosManager } from "@/components/admin/rateios-extraordinarios/rateios-extraordinarios-manager";
import { resumirCobrancaDoRateio, type CobrancaParaResumoRateio } from "@/lib/rateios";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";

type CobrancaDoRateioRow = Omit<CobrancaParaResumoRateio, "valor_principal_pago_usd" | "valor_juros_pago_usd"> & {
  pagamento_cobrancas: { valor_principal_abatido_usd: number; valor_juros_pago_usd: number }[];
};

type DespesaExtraordinariaRow = Omit<DespesaExtraordinaria, "unidade_ids"> & {
  despesa_extraordinaria_unidades: { unidade_id: string }[];
  // as cobranças do rateio (uma por unidade) dão o progresso de cobrança de cada linha
  cobrancas: CobrancaDoRateioRow[];
};

export default async function RateiosExtraordinariosPage() {
  const supabase = await createClient();
  const t = await getTranslations("common");

  const [{ data: despesas, error: despesasError }, { data: unidades, error: unidadesError }] =
    await Promise.all([
      supabase
        .from("despesas_extraordinarias")
        .select(
          "id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, created_at, despesa_extraordinaria_unidades(unidade_id), cobrancas(status, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd))",
        )
        .order("created_at", { ascending: false })
        .returns<DespesaExtraordinariaRow[]>(),
      buscarTodas((de, ate) =>
        supabase
          .from("unidades")
          .select("id, identificacao, proprietario_id, created_at, proprietario:proprietarios(id, nome)", {
            count: "exact",
          })
          .order("identificacao", { ascending: true })
          .order("id")
          .range(de, ate)
          .returns<Unidade[]>(),
      ),
    ]);

  if (despesasError || unidadesError) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", { message: despesasError?.message ?? unidadesError?.message ?? "" })}
      </p>
    );
  }

  const hojeIso = new Date().toISOString().slice(0, 10);
  const despesasComResumo = (despesas ?? []).map(({ despesa_extraordinaria_unidades, cobrancas, ...despesa }) => ({
    ...despesa,
    unidade_ids: despesa_extraordinaria_unidades.map((u) => u.unidade_id),
    resumo: resumirCobrancaDoRateio(
      cobrancas.map(({ pagamento_cobrancas, ...c }) => ({
        ...c,
        valor_principal_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0),
        valor_juros_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0),
      })),
      hojeIso,
    ),
  }));

  return <RateiosExtraordinariosManager despesas={despesasComResumo} unidades={unidades ?? []} />;
}
