"use client";

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { hrefDoMes, mesAdjacente, type AnoMes } from "@/lib/mes";
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
// continua à vista enquanto se rola. As setas ladeiam o mês ("anterior / seguinte"); tocar no
// mês abre o seletor (SeletorMes), que mostra o ano inteiro como um índice. "Mês atual" só
// aparece quando se saiu dele. O h1 "Dashboard" fica só pra leitores de tela, porque o header do
// app já diz onde se está.
export function CabecalhoMes({ titulo, ano, mes, hoje, basePath, children }: CabecalhoMesProps) {
  const t = useTranslations("common.monthNavigation");
  const ehMesAtual = ano === hoje.ano && mes === hoje.mes;

  return (
    <div className="sticky top-14 z-10 -mx-4 -mt-4 border-b bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <h1 className="sr-only">{titulo}</h1>
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="-ml-2 flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous")}
            nativeButton={false}
            render={<Link href={hrefDoMes(basePath, mesAdjacente(ano, mes, -1))} />}
          >
            <ChevronLeftIcon className="size-5" />
          </Button>

          <SeletorMes ano={ano} mes={mes} hoje={hoje} basePath={basePath} />

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("next")}
            nativeButton={false}
            render={<Link href={hrefDoMes(basePath, mesAdjacente(ano, mes, 1))} />}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        </div>

        {!ehMesAtual && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={basePath} />}>
            <Undo2 className="size-3.5" />
            {t("current")}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
