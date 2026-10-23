"use client";

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { hrefDoMes, mesAdjacente, type AnoMes } from "@/lib/mes";
import { BarraFixa } from "@/components/admin/barra-fixa";
import { SeletorMes } from "@/components/admin/painel/seletor-mes";
import { Button } from "@/components/ui/button";

type CabecalhoMesProps = {
  titulo: string;
  ano: number;
  mes: number;
  hoje: AnoMes;
  // rota que recebe o ?mes=YYYY-MM
  basePath: string;
  // o que fica preso junto com o mês (atalhos das seções, no celular)
  children?: React.ReactNode;
};

// Barra do mês do Dashboard, presa logo abaixo do header do app: o mês é o título da página e
// continua à vista enquanto se rola. À esquerda o título (que abre a grade do ano, SeletorMes); à
// direita os controles, como num calendário: "mês atual" quando se saiu dele e o par de setas
// anterior/seguinte num mesmo grupo. O h1 "Dashboard" fica só pra leitores de tela, porque o
// header do app já diz onde se está.
export function CabecalhoMes({ titulo, ano, mes, hoje, basePath, children }: CabecalhoMesProps) {
  const t = useTranslations("common.monthNavigation");
  const ehMesAtual = ano === hoje.ano && mes === hoje.mes;

  return (
    <BarraFixa>
      <h1 className="sr-only">{titulo}</h1>
      <div className="flex items-center justify-between gap-2 py-2">
        <SeletorMes ano={ano} mes={mes} hoje={hoje} basePath={basePath} />

        <div className="flex shrink-0 items-center gap-2">
          {!ehMesAtual && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              aria-label={t("current")}
              nativeButton={false}
              render={<Link href={basePath} />}
            >
              <Undo2 className="size-3.5" />
              <span className="max-sm:sr-only">{t("current")}</span>
            </Button>
          )}
          <div className="inline-flex items-center rounded-full border bg-card p-0.5 shadow-xs">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t("previous")}
              nativeButton={false}
              render={<Link href={hrefDoMes(basePath, mesAdjacente(ano, mes, -1))} />}
            >
              <ChevronLeftIcon className="size-4.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t("next")}
              nativeButton={false}
              render={<Link href={hrefDoMes(basePath, mesAdjacente(ano, mes, 1))} />}
            >
              <ChevronRightIcon className="size-4.5" />
            </Button>
          </div>
        </div>
      </div>
      {children}
    </BarraFixa>
  );
}
