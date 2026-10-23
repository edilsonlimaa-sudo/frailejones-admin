"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { INTL_LOCALE } from "@/lib/intl-locale";
import { hrefDoMes, mesAdjacente, type AnoMes } from "@/lib/mes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const MESES = Array.from({ length: 12 }, (_, i) => i + 1);

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

// Barra do mês do Dashboard, presa logo abaixo do header do app: o mês é o título da página e
// continua à vista enquanto se rola. As setas ladeiam o mês ("anterior / seguinte"); tocar no
// mês abre a grade de meses do ano, com o ano navegável, pra ir direto a um mês distante. "Mês
// atual" só aparece quando se saiu dele. O h1 "Dashboard" fica só pra leitores de tela, porque o
// header do app já diz onde se está.
export function CabecalhoMes({ titulo, ano, mes, hoje, basePath, children }: CabecalhoMesProps) {
  const t = useTranslations("common.monthNavigation");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [anoVisivel, setAnoVisivel] = useState(ano);

  const nomeDoMes = new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" });
  const nomeCurtoDoMes = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
  const nomeMes = capitalizar(nomeDoMes.format(new Date(Date.UTC(ano, mes - 1, 1))));
  const ehMesAtual = ano === hoje.ano && mes === hoje.mes;

  function alternar(abrir: boolean) {
    // a grade abre sempre no ano do mês exibido, mesmo que se tenha navegado por outros antes
    if (abrir) setAnoVisivel(ano);
    setAberto(abrir);
  }

  function escolher(mesEscolhido: number) {
    setAberto(false);
    router.push(hrefDoMes(basePath, { ano: anoVisivel, mes: mesEscolhido }));
  }

  const botaoMesAtual = (className?: string) => (
    <Button
      variant="outline"
      size="sm"
      className={className}
      nativeButton={false}
      render={<Link href={basePath} onClick={() => setAberto(false)} />}
    >
      <Undo2 className="size-3.5" />
      {t("current")}
    </Button>
  );

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

          <Popover open={aberto} onOpenChange={alternar}>
            <PopoverTrigger
              aria-label={t("choose")}
              className="group flex h-9 items-baseline gap-1.5 rounded-lg px-2 transition-colors hover:bg-muted data-popup-open:bg-muted"
            >
              <span className="text-xl font-semibold tracking-tight">{nomeMes}</span>
              <span className="text-xl font-light text-muted-foreground tabular-nums">{ano}</span>
              <ChevronDownIcon className="size-4 self-center text-muted-foreground transition-transform group-data-popup-open:rotate-180" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("previousYear")}
                  onClick={() => setAnoVisivel((atual) => atual - 1)}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="font-semibold tabular-nums">{anoVisivel}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("nextYear")}
                  onClick={() => setAnoVisivel((atual) => atual + 1)}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {MESES.map((m) => {
                  const selecionado = anoVisivel === ano && m === mes;
                  const atual = anoVisivel === hoje.ano && m === hoje.mes;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => escolher(m)}
                      aria-current={selecionado ? "date" : undefined}
                      className={cn(
                        "relative h-10 rounded-lg text-sm font-medium transition-colors",
                        selecionado ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        atual && !selecionado && "text-primary",
                      )}
                    >
                      {capitalizar(nomeCurtoDoMes.format(new Date(Date.UTC(anoVisivel, m - 1, 1))).replace(".", ""))}
                      {/* ponto marca o mês de hoje, como num calendário */}
                      {atual && (
                        <span className="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" />
                      )}
                    </button>
                  );
                })}
              </div>
              {!ehMesAtual && botaoMesAtual("mt-3 w-full")}
            </PopoverContent>
          </Popover>

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

        {!ehMesAtual && botaoMesAtual()}
      </div>
      {children}
    </div>
  );
}
