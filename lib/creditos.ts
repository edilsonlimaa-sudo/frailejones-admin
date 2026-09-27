import type { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

type AplicarSaldoAFavorParams = {
  unidadeId: string;
  cobrancaId: string;
  valorCobrancaUsd: number;
  descricaoCobranca: string;
};

// abatimento direto do principal (não é um pagamento): soma ENTRADA - SAIDA de creditos_movimentacoes
// da unidade e aplica o que houver disponível na cobrança recém-emitida, registrando a contrapartida
// como SAIDA vinculada à cobrança. Devolve o valor efetivamente aplicado (0 se não havia saldo).
// saldo em VES não congela tasa: é revalorizado em USD sempre pela cotação BCV mais recente,
// pra não distorcer o poder de compra de um saldo ainda não consumido.
export async function aplicarSaldoAFavor(
  supabase: SupabaseClient,
  { unidadeId, cobrancaId, valorCobrancaUsd, descricaoCobranca }: AplicarSaldoAFavorParams,
): Promise<number> {
  const [{ data: movimentacoes, error: saldoError }, { data: cotacaoAtual, error: cotacaoError }] =
    await Promise.all([
      supabase.from("creditos_movimentacoes").select("tipo, moeda, valor").eq("unidade_id", unidadeId),
      supabase
        .from("cotacao_bcv")
        .select("tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ tasa_ves: number }>(),
    ]);
  if (saldoError) throw saldoError;
  if (cotacaoError) throw cotacaoError;

  const saldoDisponivel = (movimentacoes ?? []).reduce((acc, movimentacao) => {
    const valorUsd =
      movimentacao.moeda === "VES"
        ? cotacaoAtual
          ? movimentacao.valor / cotacaoAtual.tasa_ves
          : 0
        : movimentacao.valor;
    return acc + (movimentacao.tipo === "ENTRADA" ? valorUsd : -valorUsd);
  }, 0);

  const valorAplicado = Number(Math.max(Math.min(saldoDisponivel, valorCobrancaUsd), 0).toFixed(2));
  if (valorAplicado <= 0) return 0;

  const quitaIntegralmente = valorAplicado >= valorCobrancaUsd - 0.01;

  const { error: updateError } = await supabase
    .from("cobrancas")
    .update({
      valor_credito_abatido_usd: valorAplicado,
      ...(quitaIntegralmente ? { status: "pago" as const } : {}),
    })
    .eq("id", cobrancaId);
  if (updateError) throw updateError;

  const { error: creditoError } = await supabase.from("creditos_movimentacoes").insert({
    unidade_id: unidadeId,
    tipo: "SAIDA",
    moeda: "USD",
    valor: valorAplicado,
    cobranca_id: cobrancaId,
    descricao: `Aplicado na cobrança "${descricaoCobranca}"`,
  });
  if (creditoError) throw creditoError;

  return valorAplicado;
}
