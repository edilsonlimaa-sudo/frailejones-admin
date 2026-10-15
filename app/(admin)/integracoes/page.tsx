import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { IntegracaoConfigurada } from "@/lib/types/integracoes";
import { IntegracoesManager } from "@/components/admin/integracoes/integracoes-manager";

export default async function IntegracoesPage() {
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
