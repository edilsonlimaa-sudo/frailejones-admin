import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { inicioDoMesCaracas } from "@/lib/arrecadacao";
import { formatMes, mesAdjacente, mesAtual, parseMes } from "@/lib/mes";
import { resolverFiltrosLiquidacoes } from "@/lib/listagem-liquidacoes";
import { LiquidacoesManager } from "@/components/admin/liquidacoes/liquidacoes-manager";
import type { Liquidacao } from "@/lib/types/pagamentos";

// pagamento_cobrancas.pagamento_id é UNIQUE, então o embed reverso (a partir de pagamentos)
// vem como objeto único (ou null), não array
type PagamentoRow = Omit<
  Liquidacao,
  "cobranca" | "principal_abatido_usd" | "encargos_pagos_usd" | "credito_gerado"
> & {
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    cobranca: Liquidacao["cobranca"];
  } | null;
  creditos_movimentacoes: { valor: number }[];
};

// lista sempre um mês de caixa por vez (?mes=YYYY-MM, padrão o mês atual), pela data do
// pagamento no fuso de Caracas: o total da tela bate com o extrato do banco daquele mês e com o
// cartão de entradas do Painel, que leva pra cá
export default async function LiquidacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; moneda?: string | string[]; forma?: string | string[]; abono?: string | string[] }>;
}) {
  const { mes: mesParam, ...filtrosParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  const seguinte = mesAdjacente(ano, mes, 1);
  const supabase = await createClient();
  const t = await getTranslations("common");

  // paginada (buscarTodas): num mês com rateios, ~300 unidades passam das 1000 linhas por consulta
  // da API, e um corte silencioso deixaria lista e totais menores que o extrato
  const { data: pagamentos, error } = await buscarTodas((de, ate) =>
    supabase
      .from("pagamentos")
      .select(
        "id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, forma_pagamento, referencia_bancaria, observacao, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, cobranca:cobrancas(id, descricao, tipo, competencia)), creditos_movimentacoes(valor)",
        { count: "exact" },
      )
      .gte("data_pagamento", inicioDoMesCaracas(ano, mes))
      .lt("data_pagamento", inicioDoMesCaracas(seguinte.ano, seguinte.mes))
      .order("data_pagamento", { ascending: false })
      .order("id")
      .range(de, ate)
      .returns<PagamentoRow[]>(),
  );

  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  const liquidacoes: Liquidacao[] = pagamentos.map(
    ({ pagamento_cobrancas, creditos_movimentacoes, ...pagamento }) => ({
      ...pagamento,
      cobranca: pagamento_cobrancas?.cobranca ?? null,
      principal_abatido_usd: pagamento_cobrancas?.valor_principal_abatido_usd ?? 0,
      encargos_pagos_usd: pagamento_cobrancas?.valor_juros_pago_usd ?? 0,
      // só ENTRADA aponta pra pagamento, e sempre na moeda dele (liquidar_cobranca)
      credito_gerado: creditos_movimentacoes.reduce((acc, c) => acc + c.valor, 0),
    }),
  );

  return (
    <LiquidacoesManager
      liquidacoes={liquidacoes}
      ano={ano}
      mes={mes}
      mesCaixa={formatMes(ano, mes)}
      filtrosIniciais={resolverFiltrosLiquidacoes(filtrosParam)}
      hoje={mesAtual()}
    />
  );
}
