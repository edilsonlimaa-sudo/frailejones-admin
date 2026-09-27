import type { Locale } from "@/i18n/config";

// mapeia o locale da UI (next-intl) pro locale do Intl usado em formatação de moeda/data
export const INTL_LOCALE: Record<Locale, string> = {
  es: "es-VE",
  pt: "pt-BR",
};
