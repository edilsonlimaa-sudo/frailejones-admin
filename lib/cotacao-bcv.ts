import { cache } from "react";

import { hojeCaracas } from "@/lib/fuso";
import { createClient } from "@/lib/supabase/server";

// Cotação BCV mantida em dia pelo próprio fluxo do app, sem cron: toda tela que usa a cotação
// passa por garantirCotacaoBcvAtualizada() antes de ler cotacao_bcv. Se a vigente estiver atrasada,
// o servidor chama a Edge Function atualizar-cotacao-bcv na hora e a página já sai com a taxa nova.

// em feriado o BCV não publica e a cotação "atrasada" é a certa: sem esse intervalo, cada página
// aberta no dia consultaria a fonte de novo
const INTERVALO_MINIMO_MS = 10 * 60_000;
// se a fonte demorar, a página sai com a cotação que já existe em vez de ficar presa
const TIMEOUT_MS = 8_000;

// sábado e domingo o BCV não publica e a cotação de sexta segue vigente: no fim de semana o
// esperado é ter a de sexta, não a do próprio dia
export function ultimoDiaUtil(dataIso: string): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  const recuo = data.getUTCDay() === 6 ? 1 : data.getUTCDay() === 0 ? 2 : 0;
  data.setUTCDate(data.getUTCDate() - recuo);
  return data.toISOString().slice(0, 10);
}

// React.cache: layout (chip do header) e página chamam na mesma requisição e compartilham uma
// única verificação. Devolve true quando gravou uma cotação nova.
export const garantirCotacaoBcvAtualizada = cache(async (): Promise<boolean> => {
  const supabase = await createClient();

  const [{ data: ultima }, { data: consulta }] = await Promise.all([
    supabase
      .from("cotacao_bcv")
      .select("data_cotacao")
      .order("data_cotacao", { ascending: false })
      .limit(1)
      .maybeSingle<{ data_cotacao: string }>(),
    supabase.from("cotacao_bcv_consulta").select("consultado_em").maybeSingle<{ consultado_em: string }>(),
  ]);

  // a última lançada pode ser a do próximo dia útil (o BCV publica à tarde): também está em dia
  if (ultima && ultima.data_cotacao >= ultimoDiaUtil(hojeCaracas())) return false;
  if (consulta && Date.now() - new Date(consulta.consultado_em).getTime() < INTERVALO_MINIMO_MS) return false;

  const { data, error } = await supabase.functions.invoke<{ inalterada: boolean }>("atualizar-cotacao-bcv", {
    timeout: TIMEOUT_MS,
  });
  if (error) {
    // o motivo fica em cotacao_bcv_consulta.erro; a página segue com a cotação que já existe
    console.error("Falha ao atualizar a cotação BCV", error);
    return false;
  }
  return data?.inalterada === false;
});

// data_cotacao da cotação que vale hoje em Caracas (a lançada pro próximo dia útil ainda não vale)
export async function dataCotacaoVigente(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cotacao_bcv")
    .select("data_cotacao")
    .lte("data_cotacao", hojeCaracas())
    .order("data_cotacao", { ascending: false })
    .limit(1)
    .maybeSingle<{ data_cotacao: string }>();
  return data?.data_cotacao ?? null;
}
