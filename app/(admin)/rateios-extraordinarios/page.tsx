import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { hojeCaracas } from "@/lib/fuso";
import { RateiosExtraordinariosManager } from "@/components/admin/rateios-extraordinarios/rateios-extraordinarios-manager";
import { pagamentosParaEncargos } from "@/lib/encargos";
import { resumirProgresso, type CobrancaParaProgresso } from "@/lib/progresso-cobranca";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";

type CobrancaDoRateioRow = Omit<CobrancaParaProgresso, "pagamentos"> & {
  pagamento_cobrancas: Parameters<typeof pagamentosParaEncargos>[0];
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
          "id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, metodo_encargos, pct_juros_mensal, criterio_mes, created_at, despesa_extraordinaria_unidades(unidade_id), cobrancas(status, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, metodo_encargos, pct_juros_mensal, criterio_mes, pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento)))",
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

  const hojeIso = hojeCaracas();
  const despesasComResumo = (despesas ?? []).map(({ despesa_extraordinaria_unidades, cobrancas, ...despesa }) => ({
    ...despesa,
    unidade_ids: despesa_extraordinaria_unidades.map((u) => u.unidade_id),
    resumo: resumirProgresso(
      cobrancas.map(({ pagamento_cobrancas, ...c }) => ({ ...c, pagamentos: pagamentosParaEncargos(pagamento_cobrancas) })),
      hojeIso,
    ),
  }));

  return <RateiosExtraordinariosManager despesas={despesasComResumo} unidades={unidades ?? []} />;
}
