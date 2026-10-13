import { getTranslations } from "next-intl/server";

import { garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";
import { createClient } from "@/lib/supabase/server";
import type { CotacaoBcv, CotacaoBcvConsulta } from "@/lib/types/cotacao-bcv";
import { CotacaoBcvManager } from "@/components/admin/cotacao-bcv/cotacao-bcv-manager";

export default async function CotacaoBcvPage() {
  await garantirCotacaoBcvAtualizada();
  const supabase = await createClient();
  const t = await getTranslations("common");

  const [{ data: cotacoes, error }, { data: consulta }] = await Promise.all([
    supabase
      .from("cotacao_bcv")
      .select("id, data_cotacao, tasa_ves, fuente, created_at")
      .order("data_cotacao", { ascending: false })
      .limit(10)
      .returns<CotacaoBcv[]>(),
    supabase.from("cotacao_bcv_consulta").select("consultado_em, erro").maybeSingle<CotacaoBcvConsulta>(),
  ]);

  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  return <CotacaoBcvManager cotacoes={cotacoes ?? []} consulta={consulta ?? null} />;
}
