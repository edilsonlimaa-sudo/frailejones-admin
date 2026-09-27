import { createClient } from "@/lib/supabase/server";
import { LiquidacoesManager } from "@/components/admin/liquidacoes/liquidacoes-manager";
import type { Liquidacao } from "@/lib/types/pagamentos";

type PagamentoRow = Omit<Liquidacao, "cobranca"> & {
  pagamento_cobrancas: { cobranca: Liquidacao["cobranca"] }[];
};

export default async function LiquidacoesPage() {
  const supabase = await createClient();

  const { data: pagamentos, error } = await supabase
    .from("pagamentos")
    .select(
      "id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, forma_pagamento, referencia_bancaria, observacao, unidade:unidades(id, identificacao), pagamento_cobrancas(cobranca:cobrancas(id, descricao, tipo))",
    )
    .order("data_pagamento", { ascending: false })
    .returns<PagamentoRow[]>();

  if (error) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {error.message}</p>;
  }

  const liquidacoes: Liquidacao[] = (pagamentos ?? []).map(
    ({ pagamento_cobrancas, ...pagamento }) => ({
      ...pagamento,
      cobranca: pagamento_cobrancas[0]?.cobranca ?? null,
    }),
  );

  return <LiquidacoesManager liquidacoes={liquidacoes} />;
}
