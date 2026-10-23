"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatMes, hrefDoMes, type AnoMes } from "@/lib/mes";
import { buscarResumoDoAno, type MesDoAno } from "@/lib/painel/resumo-ano-actions";
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

// Seletor de mês do Dashboard como índice do que há em cada mês: a grade do ano mostra, por mês,
// uma barra e o percentual do emitido que já foi saldado; mês sem cobrança fica apagado. O ano é
// navegável e cada ano é buscado uma vez (resumo_dashboard de janeiro a dezembro) ao abrir.
export function SeletorMes({ ano, mes, hoje, basePath }: SeletorMesProps) {
  const t = useTranslations("common.monthNavigation");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [anoVisivel, setAnoVisivel] = useState(ano);
  const [porAno, setPorAno] = useState<Record<number, MesDoAno[] | "erro">>({});

  const nomeDoMes = new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" });
  const nomeCurtoDoMes = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
  const nomeMes = capitalizar(nomeDoMes.format(new Date(Date.UTC(ano, mes - 1, 1))));
  const ehMesAtual = ano === hoje.ano && mes === hoje.mes;

  // busca o ano exibido na grade quando ele ainda não foi carregado
  useEffect(() => {
    if (!aberto || porAno[anoVisivel]) return;
    let cancelado = false;
    buscarResumoDoAno(anoVisivel)
      .then((meses) => {
        if (!cancelado) setPorAno((atual) => ({ ...atual, [anoVisivel]: meses }));
      })
      .catch(() => {
        if (!cancelado) setPorAno((atual) => ({ ...atual, [anoVisivel]: "erro" }));
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, anoVisivel, porAno]);

  function alternar(abrir: boolean) {
    // a grade abre sempre no ano do mês exibido, mesmo que se tenha navegado por outros antes
    if (abrir) setAnoVisivel(ano);
    setAberto(abrir);
  }

  function escolher(mesEscolhido: number) {
    setAberto(false);
    router.push(hrefDoMes(basePath, { ano: anoVisivel, mes: mesEscolhido }));
  }

  const dadosDoAno = porAno[anoVisivel];
  const carregando = dadosDoAno === undefined;

  return (
    <Popover open={aberto} onOpenChange={alternar}>
      <PopoverTrigger
        aria-label={t("choose")}
        className="group flex h-9 items-baseline gap-1.5 rounded-lg px-2 transition-colors hover:bg-muted data-popup-open:bg-muted"
      >
        <span className="text-xl font-semibold tracking-tight">{nomeMes}</span>
        <span className="text-xl font-light text-muted-foreground tabular-nums">{ano}</span>
        <ChevronDownIcon className="size-4 self-center text-muted-foreground transition-transform group-data-popup-open:rotate-180" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80">
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

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {MESES.map((m) => {
            const selecionado = anoVisivel === ano && m === mes;
            const atual = anoVisivel === hoje.ano && m === hoje.mes;
            const dado = Array.isArray(dadosDoAno)
              ? dadosDoAno.find((d) => d.mes === formatMes(anoVisivel, m))
              : undefined;
            const temCobrancas = dado !== undefined && dado.cobrancas > 0;
            const percentual =
              temCobrancas && dado.emitido > 0
                ? Math.min(100, Math.round((dado.saldado / dado.emitido) * 100))
                : 0;
            return (
              <button
                key={m}
                type="button"
                onClick={() => escolher(m)}
                aria-current={selecionado ? "date" : undefined}
                className={cn(
                  "flex h-16 flex-col justify-between rounded-xl border p-2 text-left transition-colors hover:bg-muted",
                  selecionado ? "border-primary bg-primary/10" : "border-transparent bg-muted/40",
                  !carregando && !temCobrancas && "opacity-60",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm leading-none font-medium">
                  {capitalizar(nomeCurtoDoMes.format(new Date(Date.UTC(anoVisivel, m - 1, 1))).replace(".", ""))}
                  {/* ponto marca o mês de hoje, como num calendário */}
                  {atual && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
                </span>
                {carregando ? (
                  <span className="h-1 w-full animate-pulse rounded-full bg-muted-foreground/20" />
                ) : temCobrancas ? (
                  <>
                    <span className="block h-1 w-full overflow-hidden rounded-full bg-muted-foreground/15">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
                    </span>
                    <span className="text-[11px] leading-none text-muted-foreground tabular-nums">
                      {t("settledPercent", { percent: percentual })}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] leading-none text-muted-foreground/70">{t("noCharges")}</span>
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
