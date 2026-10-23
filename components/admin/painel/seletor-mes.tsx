"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ChevronLeftIcon, ChevronRightIcon, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { INTL_LOCALE } from "@/lib/intl-locale";
import { hrefDoMes, type AnoMes } from "@/lib/mes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type SeletorMesProps = {
  ano: number;
  mes: number;
  hoje: AnoMes;
  // rota que recebe o ?mes=YYYY-MM
  basePath: string;
};

const MESES = Array.from({ length: 12 }, (_, i) => i + 1);

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

// O mês como título do Dashboard e, ao toque, a grade do ano pra ir direto a um mês distante.
// O gatilho é o próprio título, com um selo de calendário à esquerda que diz que ele abre algo:
// sem chevron. A grade tem o ano navegável, o mês de hoje marcado com um ponto e o selecionado
// preenchido; "mês atual" aparece no rodapé quando se saiu dele.
export function SeletorMes({ ano, mes, hoje, basePath }: SeletorMesProps) {
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

  return (
    <Popover open={aberto} onOpenChange={alternar}>
      <PopoverTrigger
        aria-label={t("choose")}
        className="group -ml-1 flex h-11 items-center gap-2.5 rounded-xl pr-3 pl-1 transition-colors hover:bg-muted/70 data-popup-open:bg-muted"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          <CalendarDays className="size-4.5" />
        </span>
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className="text-2xl font-bold tracking-tight">{nomeMes}</span>
          <span className="text-lg font-medium text-muted-foreground tabular-nums">{ano}</span>
        </span>
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
          <span className="text-base font-semibold tabular-nums">{anoVisivel}</span>
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
                  "relative h-11 rounded-lg text-sm font-medium transition-colors",
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

        {!ehMesAtual && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            nativeButton={false}
            render={<Link href={basePath} onClick={() => setAberto(false)} />}
          >
            <Undo2 className="size-3.5" />
            {t("current")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
