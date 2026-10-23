"use server";

import type { ResumoDashboard } from "@/lib/arrecadacao";
import { hojeCaracas } from "@/lib/fuso";
import { createClient } from "@/lib/supabase/server";

export type MesDoAno = {
  // "YYYY-MM"
  mes: string;
  emitido: number;
  // principal já saldado (saldo a favor aplicado + pagamentos, de qualquer data)
  saldado: number;
  cobrancas: number;
};

// Os 12 meses de um ano com o que foi emitido e quanto já foi saldado: alimenta o seletor de mês
// do Dashboard, que mostra cada mês como um índice do que há nele. Mesma função SQL do painel,
// com a janela de janeiro a dezembro do ano pedido.
export async function buscarResumoDoAno(ano: number): Promise<MesDoAno[]> {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error("Ano inválido");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resumo_dashboard", {
    p_mes: `${ano}-12-01`,
    p_meses: 12,
    p_hoje: hojeCaracas(),
  });
  if (error) throw new Error(error.message);

  const resumo = data as ResumoDashboard | null;
  return (resumo?.evolucao ?? []).map(({ mes, emitido, saldado, cobrancas }) => ({
    mes,
    emitido,
    saldado,
    cobrancas,
  }));
}
