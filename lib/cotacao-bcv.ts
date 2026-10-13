import { cache } from "react";

import { hojeCaracas } from "@/lib/fuso";
import { createClient } from "@/lib/supabase/server";
import type { CotacaoBcvConsulta } from "@/lib/types/cotacao-bcv";

// Cotação BCV mantida em dia pelo próprio fluxo do app, sem cron: toda tela que usa a cotação
// passa por garantirCotacaoBcvAtualizada() antes de ler cotacao_bcv. Se a vigente estiver atrasada,
// o servidor chama a Edge Function atualizar-cotacao-bcv na hora e a página já sai com a taxa nova.

// fonte ainda não confirmou o dia (ou falhou): tenta de novo logo
const INTERVALO_MINIMO_MS = 10 * 60_000;
// fonte já confirmou hoje que não há taxa nova (feriado): o BCV não publica de novo no mesmo dia
const INTERVALO_CONFIRMADO_MS = 60 * 60_000;
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

// a fonte respondeu hoje (Caracas) sem erro: a Edge Function gravou tudo o que ela tinha, então
// a cotação vigente é a correta mesmo que seja anterior ao último dia útil (feriado bancário)
function fonteConfirmouHoje(consulta: CotacaoBcvConsulta | null, hoje: string): boolean {
  return (
    consulta != null &&
    consulta.erro == null &&
    consulta.data_fonte != null &&
    hojeCaracas(new Date(consulta.consultado_em)) === hoje
  );
}

// em dia: há cotação do último dia útil (ou posterior), ou a fonte confirmou hoje que não publicou
// nada mais novo. Feriado não tem calendário aqui: quem diz se houve publicação é a própria fonte.
export function cotacaoBcvEmDia(
  dataCotacao: string | null,
  consulta: CotacaoBcvConsulta | null,
  hoje: string = hojeCaracas(),
): boolean {
  if (dataCotacao == null) return false;
  return dataCotacao >= ultimoDiaUtil(hoje) || fonteConfirmouHoje(consulta, hoje);
}

// última consulta à fonte; ler depois de garantirCotacaoBcvAtualizada() pra pegar o resultado dela
export const buscarConsultaCotacaoBcv = cache(async (): Promise<CotacaoBcvConsulta | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cotacao_bcv_consulta")
    .select("consultado_em, erro, data_fonte")
    .maybeSingle<CotacaoBcvConsulta>();
  return data ?? null;
});

// React.cache: layout (chip do header) e página chamam na mesma requisição e compartilham uma
// única verificação. Devolve true quando gravou uma cotação nova.
export const garantirCotacaoBcvAtualizada = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const hoje = hojeCaracas();

  const [{ data: ultima }, { data: consulta }] = await Promise.all([
    supabase
      .from("cotacao_bcv")
      .select("data_cotacao")
      .order("data_cotacao", { ascending: false })
      .limit(1)
      .maybeSingle<{ data_cotacao: string }>(),
    supabase
      .from("cotacao_bcv_consulta")
      .select("consultado_em, erro, data_fonte")
      .maybeSingle<CotacaoBcvConsulta>(),
  ]);

  // a última lançada pode ser a do próximo dia útil (o BCV publica à tarde): também está em dia
  if (ultima && ultima.data_cotacao >= ultimoDiaUtil(hoje)) return false;
  if (consulta) {
    const intervalo = fonteConfirmouHoje(consulta, hoje) ? INTERVALO_CONFIRMADO_MS : INTERVALO_MINIMO_MS;
    if (Date.now() - new Date(consulta.consultado_em).getTime() < intervalo) return false;
  }

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
