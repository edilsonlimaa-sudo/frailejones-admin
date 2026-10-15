import { useLocale, useTranslations } from "next-intl";

import type { RegrasEncargos } from "@/lib/encargos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import type { Locale } from "@/i18n/config";

// regras de multa/juros numa linha, no texto do método (serve em server e client components)
export function ResumoRegrasEncargos({ regras }: { regras: RegrasEncargos }) {
  const t = useTranslations("encargos.resumo");
  const locale = useLocale();
  // percentuais vêm do banco como número cru (0.1): formata no idioma da tela (0,1)
  const formatPercentual = (valor: number) =>
    new Intl.NumberFormat(INTL_LOCALE[locale as Locale], { maximumFractionDigits: 4 }).format(valor);

  return regras.metodo_encargos === "mensal"
    ? t("mensal", { interest: formatPercentual(regras.pct_juros_mensal), criterion: regras.criterio_mes })
    : t("diario", {
        penalty: formatPercentual(regras.pct_multa_atraso),
        interest: formatPercentual(regras.pct_juros_diario),
        grace: regras.dias_graca,
      });
}
