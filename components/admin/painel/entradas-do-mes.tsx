import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { EntradasNaMoeda } from "@/lib/arrecadacao";
import type { MoedaTipo } from "@/lib/types/creditos";
import { formatMoeda } from "@/lib/moeda";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EntradasDoMesProps = {
  usd: EntradasNaMoeda;
  ves: EntradasNaMoeda;
  // "YYYY-MM", repassado pro filtro de Liquidações
  mes: string;
  // demais cards da visão de caixa (ex.: dívida quitada no mês), abaixo dos cards de moeda
  children?: React.ReactNode;
};

// caixa do mês: cada moeda no seu card, sem somar nem converter. O que entrou em bolívar não
// vira dólar no caixa (perde valor com o câmbio); o equivalente em dólar só faz sentido como
// dívida quitada, que entra como children nesta mesma seção.
export async function EntradasDoMes({ usd, ves, mes, children }: EntradasDoMesProps) {
  const t = await getTranslations("dashboard.entries");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/liquidacoes?mes=${mes}`} />}
        >
          {t("viewPayments")}
          <ArrowRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CardDaMoeda moeda="USD" entradas={usd} />
        <CardDaMoeda moeda="VES" entradas={ves} />
      </div>

      {children}
    </section>
  );
}

async function CardDaMoeda({ moeda, entradas }: { moeda: MoedaTipo; entradas: EntradasNaMoeda }) {
  const t = await getTranslations("dashboard.entries");
  const tForma = await getTranslations("liquidacoes.paymentMethod");

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{t(moeda === "USD" ? "receivedUsd" : "receivedVes")}</CardDescription>
        <CardTitle className="text-xl">{formatMoeda(entradas.total, moeda)}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("paymentsCount", { count: entradas.quantidade })}
        </p>
      </CardHeader>
      <CardContent>
        {entradas.canais.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(moeda === "USD" ? "noEntriesUsd" : "noEntriesVes")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entradas.canais.map((canal) => (
              <li key={canal.forma} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {tForma(canal.forma)}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {t("paymentsCount", { count: canal.quantidade })}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatMoeda(canal.valor, moeda)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${entradas.total > 0 ? (canal.valor / entradas.total) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
