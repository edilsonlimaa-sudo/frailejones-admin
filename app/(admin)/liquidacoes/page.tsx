import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { inicioDoMesCaracas } from "@/lib/arrecadacao";
import { LiquidacoesManager } from "@/components/admin/liquidacoes/liquidacoes-manager";
import type { Liquidacao } from "@/lib/types/pagamentos";

// pagamento_cobrancas.pagamento_id é UNIQUE, então o embed reverso (a partir de pagamentos)
// vem como objeto único (ou null), não array
type PagamentoRow = Omit<Liquidacao, "cobranca"> & {
  pagamento_cobrancas: { cobranca: Liquidacao["cobranca"] } | null;
};

// ?mes=YYYY-MM filtra pelos pagamentos recebidos naquele mês (data de caixa, fuso de Caracas):
// é o destino do "Ver pagamentos" do bloco de entradas do Painel
function parseMes(mes: string | undefined) {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const [ano, mesNumero] = mes.split("-").map(Number);
  if (mesNumero < 1 || mesNumero > 12) return null;
  return { ano, mes: mesNumero };
}

export default async function LiquidacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const filtroMes = parseMes(mesParam);
  const supabase = await createClient();
  const t = await getTranslations("common");

  let query = supabase
    .from("pagamentos")
    .select(
      "id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, forma_pagamento, referencia_bancaria, observacao, unidade:unidades(id, identificacao), pagamento_cobrancas(cobranca:cobrancas(id, descricao, tipo))",
    );
  if (filtroMes) {
    query = query
      .gte("data_pagamento", inicioDoMesCaracas(filtroMes.ano, filtroMes.mes))
      .lt("data_pagamento", inicioDoMesCaracas(filtroMes.ano, filtroMes.mes + 1));
  }
  const { data: pagamentos, error } = await query
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

  return <LiquidacoesManager liquidacoes={liquidacoes} filtroMes={filtroMes} />;
}
