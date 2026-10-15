import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { INTEGRACOES_VISIVEIS } from "@/lib/integracoes";
import { createClient } from "@/lib/supabase/server";
import type { IntegracaoConfigurada } from "@/lib/types/integracoes";
import { IntegracoesManager } from "@/components/admin/integracoes/integracoes-manager";

export default async function IntegracoesPage() {
  if (!INTEGRACOES_VISIVEIS) notFound();

  const supabase = await createClient();
  const t = await getTranslations("common");

  const { data, error } = await supabase
    .from("integracao")
    .select("chave, ativa, config, atualizado_em")
    .returns<IntegracaoConfigurada[]>();

  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  return <IntegracoesManager configuradas={data ?? []} />;
}
