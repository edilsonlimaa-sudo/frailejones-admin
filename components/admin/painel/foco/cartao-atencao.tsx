import Link from "next/link";
import { CalendarClock, ChevronRight, CircleCheck, Landmark, Receipt, Siren } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Tom = "critico" | "alerta" | "info";

export type ItemAtencao = {
  chave: string;
  tom: Tom;
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  href: string;
  acao: string;
};

const estiloTom: Record<Tom, { icone: string; borda: string }> = {
  critico: { icone: "bg-destructive/10 text-destructive", borda: "hover:border-destructive/40" },
  alerta: {
    icone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    borda: "hover:border-amber-500/50",
  },
  info: { icone: "bg-sky-500/10 text-sky-700 dark:text-sky-400", borda: "hover:border-sky-500/40" },
};

export const ICONES_ATENCAO = {
  cotacao: Landmark,
  taxas: Receipt,
  vencidas: Siren,
  vencendo: CalendarClock,
} satisfies Record<string, LucideIcon>;

// central de ações: tudo que pede uma atitude do administrador agora, do mais grave pro menos
// grave, cada item levando direto pra tela onde se resolve. Vazio vira um estado de "tudo em ordem"
export async function CartaoAtencao({ itens }: { itens: ItemAtencao[] }) {
  const t = await getTranslations("dashboard.focus.attention");

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          {itens.length > 0 && (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-destructive text-[11px] font-semibold text-white tabular-nums">
              {itens.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {itens.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CircleCheck className="size-6" />
            </span>
            <p className="font-medium">{t("allClear")}</p>
            <p className="max-w-60 text-xs text-muted-foreground">{t("allClearDescription")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {itens.map((item) => {
              const Icone = item.icone;
              const estilo = estiloTom[item.tom];
              return (
                <li key={item.chave}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50",
                      estilo.borda,
                    )}
                  >
                    <span
                      className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", estilo.icone)}
                    >
                      <Icone className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug font-medium">{item.titulo}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">{item.descricao}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                      <span className="max-sm:sr-only">{item.acao}</span>
                      <ChevronRight className="size-4" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
