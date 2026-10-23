import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, Undo2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

type CabecalhoMesProps = {
  titulo: string;
  // "Octubre de 2026", já capitalizado
  mesLabel: string;
  anteriorHref: string;
  seguinteHref: string;
  // null quando o mês exibido já é o atual
  atualHref: string | null;
  // controles secundários, à direita (seletor de visão)
  controles?: React.ReactNode;
};

// Cabeçalho do Dashboard: o mês é o título, porque é ele que muda e que o resto da página detalha.
// As setas ladeiam o mês pra ler como "mês anterior / mês seguinte", não como paginação de uma
// lista. No celular o header do app já diz "Dashboard", então o h1 fica só pra leitores de tela;
// no desktop vira a linha de cima. Voltar ao mês atual só aparece quando faz sentido.
export async function CabecalhoMes({
  titulo,
  mesLabel,
  anteriorHref,
  seguinteHref,
  atualHref,
  controles,
}: CabecalhoMesProps) {
  const t = await getTranslations("common.monthNavigation");

  return (
    <div className="flex flex-col gap-1">
      <h1 className="sr-only text-sm text-muted-foreground md:not-sr-only">{titulo}</h1>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="-ml-2 flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous")}
            nativeButton={false}
            render={<Link href={anteriorHref} />}
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
          <p className="min-w-40 text-center text-xl font-semibold tracking-tight tabular-nums">{mesLabel}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("next")}
            nativeButton={false}
            render={<Link href={seguinteHref} />}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {atualHref && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={atualHref} />}>
              <Undo2 className="size-3.5" />
              {t("current")}
            </Button>
          )}
          {controles}
        </div>
      </div>
    </div>
  );
}
