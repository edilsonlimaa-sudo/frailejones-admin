import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd, formatVes } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type PendenciaDoMes = {
  id: string;
  unidadeId: string | null;
  unidade: string | null;
  origem: string;
  vencimento: string;
  // fim da carência, só quando o vencimento já passou e a cobrança está dentro dela
  fimCarencia: string | null;
  diasAtraso: number;
  // saldo devedor + encargos de hoje
  total: number;
};

// quantas aparecem antes do "mostrar mais"
const VISIVEIS = 6;

// cobranças do mês ainda abertas, das mais atrasadas pras que vencem depois. Sem rolagem interna:
// no celular, rolagem dentro de rolagem prende o dedo; o excedente abre num <details> nativo
export async function CartaoPendencias({
  pendencias,
  mesLabel,
  tasaVes,
}: {
  pendencias: PendenciaDoMes[];
  mesLabel: string;
  tasaVes: number | null;
}) {
  const t = await getTranslations("dashboard.focus.pending");
  const tDashboard = await getTranslations("dashboard");
  const locale = await getLocale();
  const formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const formatDate = (iso: string) => formatter.format(new Date(`${iso}T00:00:00Z`)).replace(".", "");

  const ordenadas = [...pendencias].sort(
    (a, b) => b.diasAtraso - a.diasAtraso || a.vencimento.localeCompare(b.vencimento),
  );
  const visiveis = ordenadas.slice(0, VISIVEIS);
  const restantes = ordenadas.slice(VISIVEIS);

  const linha = (p: PendenciaDoMes) => {
    const conteudo = (
      <>
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 self-start rounded-full",
            p.diasAtraso > 0 ? "bg-destructive" : "bg-muted-foreground/30",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">
            <span className="font-medium">{p.unidade ?? tDashboard("unitRemoved")}</span>
            <span className="text-muted-foreground"> · {p.origem}</span>
          </span>
          <span className={cn("block text-xs", p.diasAtraso > 0 ? "text-destructive" : "text-muted-foreground")}>
            {p.diasAtraso > 0
              ? t("overdue", { count: p.diasAtraso })
              : p.fimCarencia
                ? t("graceUntil", { date: formatDate(p.fimCarencia) })
                : t("dueOn", { date: formatDate(p.vencimento) })}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-medium tabular-nums">{formatUsd(p.total)}</span>
          {tasaVes && (
            <span className="block text-[11px] text-muted-foreground tabular-nums">{formatVes(p.total, tasaVes)}</span>
          )}
        </span>
      </>
    );
    return (
      <li key={p.id}>
        {p.unidadeId ? (
          <Link
            href={`/unidades/${p.unidadeId}?aba=cobrancas`}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
          >
            {conteudo}
          </Link>
        ) : (
          <div className="flex items-center gap-3 py-2">{conteudo}</div>
        )}
      </li>
    );
  };

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          {pendencias.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {pendencias.length}
            </span>
          )}
        </CardTitle>
        <CardDescription>{t("subtitle", { month: mesLabel })}</CardDescription>
      </CardHeader>
      <CardContent>
        {pendencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">{visiveis.map(linha)}</ul>
            {restantes.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">{t("showMore", { count: restantes.length })}</span>
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="flex flex-col divide-y border-t">{restantes.map(linha)}</ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
