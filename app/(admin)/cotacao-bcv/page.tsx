import { getTranslations } from "next-intl/server";

import { buscarConsultaCotacaoBcv, garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";
import { createClient } from "@/lib/supabase/server";
import { formatMes, mesAdjacente, mesAtual, parseMes } from "@/lib/mes";
import type { CotacaoBcv } from "@/lib/types/cotacao-bcv";
import { CotacaoBcvManager } from "@/components/admin/cotacao-bcv/cotacao-bcv-manager";

const SELECT_COTACAO = "id, data_cotacao, tasa_ves, fuente, created_at";

// histórico navegável por mês (?mes=YYYY-MM): só as cotações do mês escolhido, mais a última
// anterior a ele (pra variação do primeiro dia) e as duas mais recentes de todas (a vigente e a
// anterior, pro card de destaque, que não depende do mês exibido)
export default async function CotacaoBcvPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  const inicioMes = `${formatMes(ano, mes)}-01`;
  const seguinte = mesAdjacente(ano, mes, 1);
  const inicioMesSeguinte = `${formatMes(seguinte.ano, seguinte.mes)}-01`;

  await garantirCotacaoBcvAtualizada();
  const supabase = await createClient();
  const t = await getTranslations("common");

  const [
    { data: doMes, error: doMesError },
    { data: anterior, error: anteriorError },
    { data: vigentes, error: vigentesError },
    consulta,
  ] = await Promise.all([
    supabase
      .from("cotacao_bcv")
      .select(SELECT_COTACAO)
      .gte("data_cotacao", inicioMes)
      .lt("data_cotacao", inicioMesSeguinte)
      .order("data_cotacao", { ascending: false })
      .returns<CotacaoBcv[]>(),
    supabase
      .from("cotacao_bcv")
      .select(SELECT_COTACAO)
      .lt("data_cotacao", inicioMes)
      .order("data_cotacao", { ascending: false })
      .limit(1)
      .maybeSingle<CotacaoBcv>(),
    supabase
      .from("cotacao_bcv")
      .select(SELECT_COTACAO)
      .order("data_cotacao", { ascending: false })
      .limit(2)
      .returns<CotacaoBcv[]>(),
    buscarConsultaCotacaoBcv(),
  ]);

  const error = doMesError ?? anteriorError ?? vigentesError;
  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  return (
    <CotacaoBcvManager
      anoMes={{ ano, mes }}
      hoje={mesAtual()}
      cotacoes={doMes ?? []}
      anterior={anterior ?? null}
      vigentes={vigentes ?? []}
      consulta={consulta}
    />
  );
}
