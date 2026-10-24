import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { hojeCaracas } from "@/lib/fuso";
import { pagamentosParaEncargos, type CobrancaParaEncargos } from "@/lib/encargos";
import { resumirAcordo } from "@/lib/acordos";
import type { AcordoPagamento } from "@/lib/types/acordos";
import { AcordosManager, type AcordoListado } from "@/components/admin/acordos/acordos-manager";

type CobrancaDoAcordoRow = Omit<CobrancaParaEncargos, "pagamentos" | "acordo"> & {
  pagamento_cobrancas: Parameters<typeof pagamentosParaEncargos>[0];
};

type AcordoRow = AcordoPagamento & {
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  cobrancas: CobrancaDoAcordoRow[];
};

export default async function AcordosPage() {
  const supabase = await createClient();
  const t = await getTranslations("common");

  const { data, error } = await supabase
    .from("acordos_pagamento")
    .select(
      "id, unidade_id, data_inicio, observacao, valor_parcela_usd, quebrado_em, created_at, unidade:unidades(id, identificacao, proprietario:proprietarios(nome)), cobrancas(status, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, metodo_encargos, pct_juros_mensal, criterio_mes, pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento)))",
    )
    .order("data_inicio", { ascending: false })
    .returns<AcordoRow[]>();

  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  const hojeIso = hojeCaracas();
  const acordos: AcordoListado[] = (data ?? []).map(({ cobrancas, unidade, ...acordo }) => ({
    ...acordo,
    unidade,
    resumo: resumirAcordo(
      acordo,
      cobrancas.map(({ pagamento_cobrancas, ...c }) => ({
        ...c,
        pagamentos: pagamentosParaEncargos(pagamento_cobrancas),
        acordo: { data_inicio: acordo.data_inicio, quebrado_em: acordo.quebrado_em },
      })),
      hojeIso,
    ),
  }));

  return <AcordosManager acordos={acordos} />;
}
