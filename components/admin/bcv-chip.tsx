import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { hojeCaracas } from "@/lib/fuso";
import { formatBs } from "@/lib/moeda";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// sábado e domingo o BCV não publica e a cotação de sexta segue vigente: no fim de semana o
// esperado é ter a de sexta, não a do próprio dia
function ultimoDiaUtil(dataIso: string): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  const recuo = data.getUTCDay() === 6 ? 1 : data.getUTCDay() === 0 ? 2 : 0;
  data.setUTCDate(data.getUTCDate() - recuo);
  return data.toISOString().slice(0, 10);
}

// "YYYY-MM-DD" -> "DD/MM"
function diaMes(dataIso: string): string {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

// chip do header com a cotação BCV vigente hoje (Caracas). Fica âmbar quando falta lançar a do dia
export async function BcvChip() {
  const supabase = await createClient();
  const t = await getTranslations("nav.bcvChip");
  const hoje = hojeCaracas();

  // cotação lançada com data futura (o BCV publica a do dia útil seguinte) ainda não vale hoje
  const { data: cotacao } = await supabase
    .from("cotacao_bcv")
    .select("data_cotacao, tasa_ves")
    .lte("data_cotacao", hoje)
    .order("data_cotacao", { ascending: false })
    .limit(1)
    .maybeSingle<{ data_cotacao: string; tasa_ves: number }>();

  const emDia = cotacao != null && cotacao.data_cotacao >= ultimoDiaUtil(hoje);
  const descricao = !cotacao
    ? t("missing")
    : cotacao.data_cotacao === hoje
      ? t("today", { tasa: formatBs(cotacao.tasa_ves) })
      : t(emDia ? "current" : "stale", { tasa: formatBs(cotacao.tasa_ves), date: diaMes(cotacao.data_cotacao) });

  return (
    <Link
      href="/cotacao-bcv"
      title={descricao}
      aria-label={descricao}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors",
        emDia
          ? "border-primary/20 bg-primary/5 text-foreground hover:bg-primary/10"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400",
      )}
    >
      <span className="relative flex size-2">
        {!emDia ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:hidden" />
        ) : null}
        <span className={cn("relative inline-flex size-2 rounded-full", emDia ? "bg-primary" : "bg-amber-500")} />
      </span>
      <span className="opacity-70 max-sm:hidden">BCV</span>
      {cotacao ? <span>{formatBs(cotacao.tasa_ves)}</span> : <span>{t("missingShort")}</span>}
      {cotacao && !emDia ? (
        <span className="opacity-80 max-sm:hidden">· {diaMes(cotacao.data_cotacao)}</span>
      ) : null}
    </Link>
  );
}
