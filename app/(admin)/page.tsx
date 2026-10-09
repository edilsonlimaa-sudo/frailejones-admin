import Link from "next/link";
import { Building2, HardHat, Receipt, TriangleAlert } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
import {
  inicioDoMesCaracas,
  mesCaixaCaracas,
  resumirEntradas,
  type PagamentoDoPeriodo,
} from "@/lib/arrecadacao";
import { calcularEncargos } from "@/lib/encargos";
import { formatMes, mesAdjacente, parseMes } from "@/lib/mes";
import { NavegadorMes } from "@/components/admin/navegador-mes";
import { EntradasDoMes } from "@/components/admin/painel/entradas-do-mes";
import {
  EvolucaoArrecadacaoChart,
  type PontoEvolucao,
} from "@/components/admin/painel/evolucao-arrecadacao-chart";
import { formatUsd, formatVes } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const statusVariant: Record<CobrancaStatus, "outline" | "default" | "destructive"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
};

type CobrancaDoMes = {
  id: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  status: CobrancaStatus;
  unidade: { id: string; identificacao: string } | null;
  pagamento_cobrancas: { valor_principal_abatido_usd: number; valor_juros_pago_usd: number }[];
};

// quantos meses (incluindo o selecionado) o gráfico de evolução mostra
const MESES_EVOLUCAO = 6;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  const hoje = new Date();
  const hojeIso = hoje.toISOString().slice(0, 10);

  const t = await getTranslations("dashboard");
  const tStatus = await getTranslations("cobrancas.status");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const mesLabelFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const { ano: anoSeguinte, mes: mesSeguinteNumero } = mesAdjacente(ano, mes, 1);
  const inicioMesSeguinte = `${anoSeguinte}-${String(mesSeguinteNumero).padStart(2, "0")}-01`;
  const mesLabel = mesLabelFormatter.format(new Date(`${inicioMes}T00:00:00Z`));
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  const mesRotuloCurtoFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "short",
    timeZone: "UTC",
  });

  // janela do gráfico de evolução: os MESES_EVOLUCAO meses que terminam no mês selecionado
  const inicioEvolucao = mesAdjacente(ano, mes, -(MESES_EVOLUCAO - 1));
  const competenciaInicioEvolucao = `${formatMes(inicioEvolucao.ano, inicioEvolucao.mes)}-01`;

  const supabase = await createClient();

  const [
    { data: cobrancasRaw, error: cobrancasError },
    { data: taxaVinculosRaw, error: taxaVinculosError },
    { data: cotacaoBcv, error: cotacaoBcvError },
    { data: pagamentosRaw, error: pagamentosError },
    { data: cobrancasEvolucaoRaw, error: cobrancasEvolucaoError },
  ] = await Promise.all([
      supabase
        .from("cobrancas")
        .select(
          "id, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd)",
        )
        .gte("competencia", inicioMes)
        .lt("competencia", inicioMesSeguinte)
        .order("data_vencimento", { ascending: true })
        .returns<CobrancaDoMes[]>(),
      supabase.from("taxa_condominio_unidades").select("unidade_id").returns<{ unidade_id: string }[]>(),
      supabase
        .from("cotacao_bcv")
        .select("data_cotacao, tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ data_cotacao: string; tasa_ves: number }>(),
      // pagamentos por data de caixa (não por competência): cobre o mês selecionado e a
      // janela do gráfico de evolução numa consulta só
      supabase
        .from("pagamentos")
        .select(
          "id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, forma_pagamento, pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, cobranca:cobrancas(competencia))",
        )
        .gte("data_pagamento", inicioDoMesCaracas(inicioEvolucao.ano, inicioEvolucao.mes))
        .lt("data_pagamento", inicioDoMesCaracas(anoSeguinte, mesSeguinteNumero))
        .returns<PagamentoDoPeriodo[]>(),
      supabase
        .from("cobrancas")
        .select("competencia, valor_usd")
        .neq("status", "cancelado")
        .gte("competencia", competenciaInicioEvolucao)
        .lt("competencia", inicioMesSeguinte)
        .returns<{ competencia: string; valor_usd: number }[]>(),
    ]);

  const loadError =
    cobrancasError ?? taxaVinculosError ?? cotacaoBcvError ?? pagamentosError ?? cobrancasEvolucaoError;
  if (loadError) {
    return <p className="text-sm text-destructive">{t("loadError", { message: loadError.message })}</p>;
  }

  const mesSelecionado = formatMes(ano, mes);
  const pagamentos = pagamentosRaw ?? [];
  const resumoEntradas = resumirEntradas(
    pagamentos.filter((p) => mesCaixaCaracas(p.data_pagamento) === mesSelecionado),
    inicioMes,
  );

  const evolucao: PontoEvolucao[] = Array.from({ length: MESES_EVOLUCAO }, (_, i) => {
    const ponto = mesAdjacente(inicioEvolucao.ano, inicioEvolucao.mes, i);
    const chave = formatMes(ponto.ano, ponto.mes);
    return {
      mes: chave,
      rotulo: mesRotuloCurtoFormatter.format(new Date(`${chave}-01T00:00:00Z`)).replace(".", ""),
      emitido: 0,
      recebido: 0,
    };
  });
  const pontoPorMes = new Map(evolucao.map((p) => [p.mes, p]));
  for (const c of cobrancasEvolucaoRaw ?? []) {
    const ponto = pontoPorMes.get(c.competencia.slice(0, 7));
    if (ponto) ponto.emitido += c.valor_usd;
  }
  for (const p of pagamentos) {
    const ponto = pontoPorMes.get(mesCaixaCaracas(p.data_pagamento));
    if (ponto) ponto.recebido += p.valor_equivalente_usd;
  }

  // conta unidades distintas vinculadas a alguma taxa (uma unidade pode estar em N taxas)
  const unidadesAtivas = new Set((taxaVinculosRaw ?? []).map((v) => v.unidade_id)).size;

  const cobrancas = cobrancasRaw ?? [];
  const ativas = cobrancas.filter((c) => c.status !== "cancelado");
  const valorEmitido = ativas.reduce((acc, c) => acc + c.valor_usd, 0);
  // quitado com crédito não é dinheiro novo entrando no mês: fica separado do quitado com pagamento
  const valorQuitadoComCredito = ativas.reduce((acc, c) => acc + c.valor_credito_abatido_usd, 0);
  const valorQuitadoComPagamento = ativas.reduce(
    (acc, c) =>
      acc +
      c.pagamento_cobrancas.reduce(
        (sum, p) => sum + p.valor_principal_abatido_usd + p.valor_juros_pago_usd,
        0,
      ),
    0,
  );
  const valorArrecadado = valorQuitadoComCredito + valorQuitadoComPagamento;
  const pendentes = ativas.filter((c) => c.status === "pendente");
  const linhasPendentes = pendentes.map((c) => ({
    cobranca: c,
    encargos: calcularEncargos(
      {
        ...c,
        valor_principal_pago_usd: c.pagamento_cobrancas.reduce(
          (acc, p) => acc + p.valor_principal_abatido_usd,
          0,
        ),
      },
      hojeIso,
    ),
  }));
  const emAtraso = linhasPendentes.filter((l) => l.encargos.diasAtraso > 0);
  const valorEmAberto = linhasPendentes.reduce((acc, l) => acc + l.encargos.saldoDevedor, 0);
  const valorEmAtrasoComEncargos = emAtraso.reduce(
    (acc, l) => acc + l.encargos.valorTotalComEncargos,
    0,
  );
  const progresso = valorEmitido > 0 ? Math.min(100, (valorArrecadado / valorEmitido) * 100) : 0;

  // a cotação é atualizada pelo cron; se a mais recente for anterior a hoje (no fuso de Caracas),
  // a atualização falhou e liquidações em VES usariam uma taxa vencida. Em fim de semana e feriado
  // não há aviso falso: a taxa publicada na sexta já vem com a data do próximo dia útil.
  const hojeCaracas = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(hoje);
  const cotacaoDesatualizada = !cotacaoBcv || cotacaoBcv.data_cotacao < hojeCaracas;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{mesLabelCapitalizado}</p>
        </div>
        <NavegadorMes ano={ano} mes={mes} basePath="/" />
      </div>

      {cotacaoDesatualizada && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 px-4 py-3 text-sm"
        >
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              {cotacaoBcv
                ? t("staleRate", { date: formatDate(cotacaoBcv.data_cotacao) })
                : t("missingRate")}
            </p>
          </div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/cotacao-bcv" />}>
            {t("updateRate")}
          </Button>
        </div>
      )}

      <EntradasDoMes resumo={resumoEntradas} mes={mesSelecionado} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">{t("billingTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("billingDescription")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t("issuedThisMonth")}</CardDescription>
              <CardTitle className="text-xl">{formatUsd(valorEmitido)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("chargesCount", { count: ativas.length })}
              </p>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t("settledThisMonth")}</CardDescription>
              <CardTitle className="text-xl">{formatUsd(valorArrecadado)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("settledSplit", {
                  payment: formatUsd(valorQuitadoComPagamento),
                  credit: formatUsd(valorQuitadoComCredito),
                })}
              </p>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t("pending")}</CardDescription>
              <CardTitle className="text-xl">{pendentes.length}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("openAmount", { value: formatUsd(valorEmAberto) })}
              </p>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t("overdue")}</CardDescription>
              <CardTitle className="text-xl text-destructive">{emAtraso.length}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("withCharges", { value: formatUsd(valorEmAtrasoComEncargos) })}
              </p>
            </CardHeader>
          </Card>
        </div>

        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("collectionTitle")}</CardTitle>
            <CardDescription>{t("activeUnitsDescription", { count: unidadesAtivas })}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progresso} />
            <p className="mt-2 text-xs text-muted-foreground">{t("collectedPercent", { percent: progresso.toFixed(0) })}</p>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card size="sm" className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("evolutionTitle")}</CardTitle>
            <CardDescription>{t("evolutionDescription", { count: MESES_EVOLUCAO })}</CardDescription>
          </CardHeader>
          <CardContent>
            <EvolucaoArrecadacaoChart
              dados={evolucao}
              labels={{ emitido: t("chartIssued"), recebido: t("chartReceived") }}
            />
          </CardContent>
        </Card>

        <Card size="sm" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("pendingChargesTitle")}</CardTitle>
            <CardDescription>{t("pendingChargesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPendingCharges")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {linhasPendentes.slice(0, 6).map(({ cobranca: c, encargos }) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {c.unidade?.identificacao ?? t("unitRemoved")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dueOn", { date: formatDate(c.data_vencimento) })}
                        {encargos.diasAtraso > 0 && (
                          <span className="text-destructive">
                            {" "}
                            · {tStatus("daysOverdue", { count: encargos.diasAtraso })}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <span className="font-medium">
                          {formatUsd(
                            encargos.diasAtraso > 0 ? encargos.valorTotalComEncargos : c.valor_usd,
                          )}
                        </span>
                        {cotacaoBcv && (
                          <p className="text-xs text-muted-foreground">
                            {formatVes(
                              encargos.diasAtraso > 0 ? encargos.valorTotalComEncargos : c.valor_usd,
                              cotacaoBcv.tasa_ves,
                            )}
                          </p>
                        )}
                      </div>
                      <Badge variant={statusVariant[c.status]}>{tStatus(c.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4"
          nativeButton={false}
          render={<Link href="/unidades" />}
        >
          <Building2 className="size-5 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium">{t("shortcutUnidades")}</p>
            <p className="text-xs text-muted-foreground">{t("shortcutUnidadesDescription")}</p>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4"
          nativeButton={false}
          render={<Link href="/taxas-condominio" />}
        >
          <Receipt className="size-5 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium">{t("shortcutTaxas")}</p>
            <p className="text-xs text-muted-foreground">{t("shortcutTaxasDescription")}</p>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4"
          nativeButton={false}
          render={<Link href="/rateios-extraordinarios" />}
        >
          <HardHat className="size-5 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium">{t("shortcutRateios")}</p>
            <p className="text-xs text-muted-foreground">{t("shortcutRateiosDescription")}</p>
          </div>
        </Button>
      </div>
    </div>
  );
}
