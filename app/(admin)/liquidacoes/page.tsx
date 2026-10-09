import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { inicioDoMesCaracas } from "@/lib/arrecadacao";
import { mesAdjacente, parseMes } from "@/lib/mes";
import { LiquidacoesManager } from "@/components/admin/liquidacoes/liquidacoes-manager";
import type { Liquidacao } from "@/lib/types/pagamentos";

// pagamento_cobrancas.pagamento_id é UNIQUE, então o embed reverso (a partir de pagamentos)
// vem como objeto único (ou null), não array
type PagamentoRow = Omit<Liquidacao, "cobranca"> & {
  pagamento_cobrancas: { cobranca: Liquidacao["cobranca"] } | null;
};

// lista sempre um mês de caixa por vez (?mes=YYYY-MM, padrão o mês atual), pela data do
// pagamento no fuso de Caracas: o total da tela bate com o extrato do banco daquele mês
export default async function LiquidacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  const seguinte = mesAdjacente(ano, mes, 1);
  const supabase = await createClient();
  const t = await getTranslations("common");

  const { data: pagamentos, error } = await supabase
    .from("pagamentos")
    .select(
      "id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, forma_pagamento, referencia_bancaria, observacao, unidade:unidades(id, identificacao), pagamento_cobrancas(cobranca:cobrancas(id, descricao, tipo))",
    )
    .gte("data_pagamento", inicioDoMesCaracas(ano, mes))
    .lt("data_pagamento", inicioDoMesCaracas(seguinte.ano, seguinte.mes))
    .order("data_pagamento", { ascending: false })
    .returns<PagamentoRow[]>();

  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  const liquidacoes: Liquidacao[] = (pagamentos ?? []).map(
    ({ pagamento_cobrancas, ...pagamento }) => ({
      ...pagamento,
      cobranca: pagamento_cobrancas?.cobranca ?? null,
    }),
  );

  return <LiquidacoesManager liquidacoes={liquidacoes} ano={ano} mes={mes} />;
}
