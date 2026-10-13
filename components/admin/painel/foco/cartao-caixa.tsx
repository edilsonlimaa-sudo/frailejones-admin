import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { EntradasNaMoeda, ResumoEntradas } from "@/lib/arrecadacao";
import type { MoedaTipo } from "@/lib/types/creditos";
import { formatMoeda, formatUsd } from "@/lib/moeda";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// caixa do mês: dólar e bolívar lado a lado, nunca somados nem convertidos (mesma regra da visão
// clássica). Embaixo, uma linha só com quanto esse dinheiro abateu de dívida, em dólares
export async function CartaoCaixa({ entradas, mes }: { entradas: ResumoEntradas; mes: string }) {
  const t = await getTranslations("dashboard.focus.cash");
  const q = entradas.quitacao;
  const partesQuitacao = [
    { chave: "doMes", valor: q.principalDoMes },
    { chave: "atrasado", valor: q.principalAtrasado },
    { chave: "adiantado", valor: q.principalAdiantado },
    { chave: "encargos", valor: q.encargos },
  ].filter((p) => p.valor > 0);

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/liquidacoes?mes=${mes}`} />}>
            {t("viewPayments")}
            <ArrowRightIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <BlocoMoeda moeda="USD" rotulo={t("usd")} entradas={entradas.usd} />
          <BlocoMoeda moeda="VES" rotulo={t("ves")} entradas={entradas.ves} />
        </div>

        <div className="mt-auto rounded-xl border border-dashed p-3">
          {q.total === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noSettlement")}</p>
          ) : (
            <>
              <p className="text-sm font-medium">{t("settled", { value: formatUsd(q.total) })}</p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {partesQuitacao.map((p) => `${formatUsd(p.valor)} ${t(`settledRows.${p.chave}`)}`).join(" · ")}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

async function BlocoMoeda({
  moeda,
  rotulo,
  entradas,
}: {
  moeda: MoedaTipo;
  rotulo: string;
  entradas: EntradasNaMoeda;
}) {
  const t = await getTranslations("dashboard.focus.cash");
  const tForma = await getTranslations("liquidacoes.paymentMethod");

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/50 p-3">
      <div>
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="truncate text-lg font-semibold tracking-tight tabular-nums">
          {formatMoeda(entradas.total, moeda)}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("payments", { count: entradas.quantidade })}</p>
      </div>
      {entradas.canais.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {entradas.canais.map((canal) => (
            <li key={canal.forma} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-muted-foreground">{tForma(canal.forma)}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {entradas.total > 0 ? Math.round((canal.valor / entradas.total) * 100) : 0}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${entradas.total > 0 ? (canal.valor / entradas.total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
