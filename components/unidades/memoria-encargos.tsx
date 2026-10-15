"use client";

import { useLocale, useTranslations } from "next-intl";

import { arredondarCentavos, type MemoriaEncargos, type TrechoJuros } from "@/lib/encargos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { Locale } from "@/i18n/config";
import { ResumoRegrasEncargos } from "@/components/admin/encargos/resumo-regras-encargos";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

type MemoriaEncargosPopoverProps = {
  memoria: MemoriaEncargos;
  // multa + juros devidos hoje (o mesmo valor mostrado na linha)
  total: number;
  children: React.ReactNode;
};

// o valor de multa/juros da linha vira um botão que abre o passo a passo do cálculo: responde
// "como chegou nesse valor?" pro admin e pro morador no portal (abre com toque no celular)
export function MemoriaEncargosPopover({ memoria, total, children }: MemoriaEncargosPopoverProps) {
  const t = useTranslations("encargos.memoria");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as Locale];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const formatPct = (valor: number) =>
    new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 4 }).format(valor);
  // trechos guardam o valor exato; arredonda antes de formatar (o Intl não arredonda meio centavo
  // do mesmo jeito que o banco)
  const usd = (valor: number) => formatUsd(arredondarCentavos(valor));

  const { regras } = memoria;
  const mensal = regras.metodo_encargos === "mensal";
  // trechos congelados seguidos (acordo vigente, base 0) viram uma linha só
  const trechos = memoria.trechos.reduce<TrechoJuros[]>((acc, trecho) => {
    const ultimo = acc.at(-1);
    if (ultimo && ultimo.congelado && trecho.congelado && ultimo.base === 0 && trecho.base === 0) {
      acc[acc.length - 1] = { ...ultimo, ate: trecho.ate, quantidade: ultimo.quantidade + trecho.quantidade };
    } else {
      acc.push(trecho);
    }
    return acc;
  }, []);

  return (
    <Popover>
      <PopoverTrigger className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-foreground">
        {children}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex flex-col gap-2 text-xs">
        <PopoverTitle className="text-sm">{t("title", { value: formatUsd(total) })}</PopoverTitle>
        <p className="text-muted-foreground">
          <ResumoRegrasEncargos regras={regras} />
        </p>
        {!mensal && regras.dias_graca > 0 && (
          <p className="text-muted-foreground">{t("grace", { date: formatDate(memoria.prazo) })}</p>
        )}
        {memoria.acordo && (
          <p className="rounded-lg bg-muted px-2 py-1.5">
            {memoria.acordo.quebrado_em
              ? t("agreementBroken", {
                  broken: formatDate(memoria.acordo.quebrado_em),
                  date: formatDate(memoria.acordo.data_inicio),
                })
              : t("agreementActive", { date: formatDate(memoria.acordo.data_inicio) })}
          </p>
        )}

        <ul className="flex flex-col gap-1 border-t pt-2">
          {memoria.multa && (
            <Linha
              rotulo={t("penalty", { pct: formatPct(regras.pct_multa_atraso), base: usd(memoria.multa.base) })}
              valor={usd(memoria.multa.valor)}
            />
          )}
          {trechos.map((trecho) => (
            <Linha
              key={trecho.de}
              rotulo={
                trecho.congelado && trecho.base === 0
                  ? t(mensal ? "frozenMonths" : "frozenDays", {
                      count: trecho.quantidade,
                      from: formatDate(trecho.de),
                      to: formatDate(trecho.ate),
                    })
                  : t(mensal ? "monthlyStretch" : "dailyStretch", {
                      count: trecho.quantidade,
                      from: formatDate(trecho.de),
                      to: formatDate(trecho.ate),
                      pct: formatPct(mensal ? regras.pct_juros_mensal : regras.pct_juros_diario),
                      base: usd(trecho.base),
                    })
              }
              valor={usd(trecho.valor)}
            />
          ))}
          {memoria.jaPago > 0 && <Linha rotulo={t("alreadyPaid")} valor={`−${usd(memoria.jaPago)}`} />}
          <li className="flex items-baseline justify-between gap-3 border-t pt-1 font-medium">
            <span>{t("total")}</span>
            <span className="tabular-nums">{formatUsd(total)}</span>
          </li>
        </ul>

        {memoria.proximoMes && (
          <p className="rounded-lg bg-muted px-2 py-1.5">
            {t("nextMonth", { date: formatDate(memoria.proximoMes.data), value: formatUsd(memoria.proximoMes.valor) })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="shrink-0 tabular-nums">{valor}</span>
    </li>
  );
}
