import type { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

type AplicarSaldoAFavorParams = {
  unidadeId: string;
  cobrancaId: string;
  valorCobrancaUsd: number;
  descricaoCobranca: string;
};

// Calcula o saldo disponível de cada carteira (USD e VES convertido para USD pela cotação atual),
// aplica o crédito disponível na cobrança recém-emitida e registra SAÍDAs na moeda correta de
// cada carteira — nunca mistura moedas. Devolve o valor efetivamente aplicado em USD (0 se não
// havia saldo). Estratégia: consome primeiro a carteira USD e complementa com VES se necessário.
export async function aplicarSaldoAFavor(
  supabase: SupabaseClient,
  { unidadeId, cobrancaId, valorCobrancaUsd, descricaoCobranca }: AplicarSaldoAFavorParams,
): Promise<number> {
  const [{ data: movimentacoes, error: saldoError }, { data: cotacaoAtual, error: cotacaoError }] =
    await Promise.all([
      supabase
        .from("creditos_movimentacoes")
        .select("tipo, moeda, valor")
        .eq("unidade_id", unidadeId),
      supabase
        .from("cotacao_bcv")
        .select("tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ tasa_ves: number }>(),
    ]);
  if (saldoError) throw saldoError;
  if (cotacaoError) throw cotacaoError;

  const lista = movimentacoes ?? [];

  // Saldo líquido de cada carteira na própria moeda
  const saldoUsd = lista
    .filter((m) => m.moeda === "USD")
    .reduce((acc, m) => acc + (m.tipo === "ENTRADA" ? m.valor : -m.valor), 0);

  const saldoVes = lista
    .filter((m) => m.moeda === "VES")
    .reduce((acc, m) => acc + (m.tipo === "ENTRADA" ? m.valor : -m.valor), 0);

  // Converte o saldo VES para USD (sem congelar tasa — é saldo ainda não consumido)
  const saldoVesEmUsd =
    cotacaoAtual && saldoVes > 0 ? saldoVes / cotacaoAtual.tasa_ves : 0;

  const saldoTotalDisponivel = Math.max(saldoUsd, 0) + Math.max(saldoVesEmUsd, 0);
  const valorAplicado = Number(
    Math.max(Math.min(saldoTotalDisponivel, valorCobrancaUsd), 0).toFixed(2),
  );

  if (valorAplicado <= 0) return 0;

  const quitaIntegralmente = valorAplicado >= valorCobrancaUsd - 0.01;

  // Atualiza a cobrança
  const { error: updateError } = await supabase
    .from("cobrancas")
    .update({
      valor_credito_abatido_usd: valorAplicado,
      ...(quitaIntegralmente ? { status: "pago" as const } : {}),
    })
    .eq("id", cobrancaId);
  if (updateError) throw updateError;

  // Registra as SAÍDAs — primeiro esgota USD, depois complementa com VES
  let restanteUsd = valorAplicado;

  // SAÍDA da carteira USD
  const saidaUsd = Number(Math.min(Math.max(saldoUsd, 0), restanteUsd).toFixed(2));
  if (saidaUsd > 0) {
    const { error } = await supabase.from("creditos_movimentacoes").insert({
      unidade_id: unidadeId,
      tipo: "SAIDA",
      moeda: "USD",
      valor: saidaUsd,
      cobranca_id: cobrancaId,
      descricao: `Aplicado na cobrança "${descricaoCobranca}"`,
    });
    if (error) throw error;
    restanteUsd -= saidaUsd;
  }

  // SAÍDA da carteira VES (complemento, se necessário)
  if (restanteUsd > 0.001 && cotacaoAtual && saldoVes > 0) {
    // reconverte o restante em VES usando a cotação atual
    const saidaVes = Number(
      Math.min(saldoVes, restanteUsd * cotacaoAtual.tasa_ves).toFixed(2),
    );
    if (saidaVes > 0) {
      const { error } = await supabase.from("creditos_movimentacoes").insert({
        unidade_id: unidadeId,
        tipo: "SAIDA",
        moeda: "VES",
        valor: saidaVes,
        cobranca_id: cobrancaId,
        descricao: `Aplicado na cobrança "${descricaoCobranca}"`,
      });
      if (error) throw error;
    }
  }

  return valorAplicado;
}
