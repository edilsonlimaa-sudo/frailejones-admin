import Link from "next/link";
import { Building2, HardHat, InfoIcon, Receipt, TriangleAlert } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
import {
  mesCaixaCaracas,
  montarResumoEntradas,
  percentualEmDia,
  type ResumoDashboard,
} from "@/lib/arrecadacao";
import { calcularEncargos } from "@/lib/encargos";
import { diferencaArredondamento, formatDiferenca } from "@/lib/rateios";
import { taxasSemEmissaoNoMes } from "@/lib/taxas";
import { formatMes, mesAdjacente, parseMes } from "@/lib/mes";
import { NavegadorMes } from "@/components/admin/navegador-mes";
import { EntradasDoMes } from "@/components/admin/painel/entradas-do-mes";
import { QuitacaoDoMes } from "@/components/admin/painel/quitacao-do-mes";
import { RecaudacaoDoMes } from "@/components/admin/painel/recaudacao-do-mes";
import { DeudaTotal, type CobrancaPendenteTotal } from "@/components/admin/painel/deuda-total";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const statusVariant: Record<CobrancaStatus, "outline" | "default" | "destructive"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
};

type CobrancaDoMes = {
  id: string;
  descricao: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  status: CobrancaStatus;
  unidade: { id: string; identificacao: string } | null;
  // título da origem: a descrição das ordinárias é sempre "Taxa de condomínio", então sem isto
  // a lista de pendentes não distingue a cuota do fundo de reserva
  taxa: { titulo: string } | null;
  despesa: { id: string; titulo: string; valor_total_usd: number; valor_por_unidade_usd: number } | null;
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento: { data_pagamento: string } | null;
  }[];
};

// quantos meses (incluindo o selecionado) o gráfico de evolução mostra
const MESES_EVOLUCAO = 6;

const somarDias = (dataIso: string, dias: number) => {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

// último dia útil (seg–sex) até a data: o BCV não publica taxa com fecha valor de sábado ou
// domingo, então no fim de semana a vigente é a de sexta (feriados não são considerados)
const ultimoDiaUtil = (dataIso: string) => {
  const diaDaSemana = new Date(`${dataIso}T00:00:00Z`).getUTCDay();
  return somarDias(dataIso, diaDaSemana === 6 ? -1 : diaDaSemana === 0 ? -2 : 0);
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  const hoje = new Date();
  const hojeIso = hoje.toISOString().slice(0, 10);
  const hojeCaracas = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(hoje);

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

  const supabase = await createClient();

  const [
    { data: cobrancasRaw, error: cobrancasError },
    { data: taxaVinculosRaw, error: taxaVinculosError },
    { data: cotacaoBcv, error: cotacaoBcvError },
    { data: resumoRaw, error: resumoError },
    { data: pendentesTotaisRaw, error: pendentesTotaisError },
    { data: taxasRaw, error: taxasError },
  ] = await Promise.all([
      // paginadas (buscarTodas): um mês de ~300 unidades com 2 taxas e 2 rateios passa das 1000
      // linhas que a API devolve por consulta
      buscarTodas((de, ate) =>
        supabase
          .from("cobrancas")
          .select(
            "id, descricao, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, unidade:unidades(id, identificacao), taxa:taxa_condominio(titulo), despesa:despesas_extraordinarias(id, titulo, valor_total_usd, valor_por_unidade_usd), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento))",
            { count: "exact" },
          )
          .gte("competencia", inicioMes)
          .lt("competencia", inicioMesSeguinte)
          .order("data_vencimento", { ascending: true })
          .order("id")
          .range(de, ate)
          .returns<CobrancaDoMes[]>(),
      ),
      buscarTodas((de, ate) =>
        supabase
          .from("taxa_condominio_unidades")
          .select("unidade_id", { count: "exact" })
          .order("id")
          .range(de, ate)
          .returns<{ unidade_id: string }[]>(),
      ),
      supabase
        .from("cotacao_bcv")
        .select("data_cotacao, tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ data_cotacao: string; tasa_ves: number }>(),
      // caixa do mês e gráfico de evolução somados no banco: a janela de 6 meses passa das 1000
      // linhas que a API devolve por consulta, e as somas sairiam cortadas sem erro
      supabase.rpc("resumo_dashboard", {
        p_mes: inicioMes,
        p_meses: MESES_EVOLUCAO,
        p_hoje: hojeCaracas,
      }),
      // tudo que está pendente hoje, de qualquer competência (card de dívida total). Paginada: com
      // inadimplência acumulada passa fácil de 1000 cobranças, e um corte silencioso mostraria uma
      // dívida menor que a real. Fica em linhas (não somada no banco) porque multa e juros de hoje
      // são calculados por lib/encargos, a mesma regra das demais telas
      buscarTodas((de, ate) =>
        supabase
          .from("cobrancas")
          .select(
            "id, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, unidade:unidades(id, identificacao, proprietario:proprietarios(nome)), pagamento_cobrancas(valor_principal_abatido_usd)",
            { count: "exact" },
          )
          .eq("status", "pendente")
          .order("id")
          .range(de, ate)
          .returns<CobrancaPendenteTotal[]>(),
      ),
      // cuotas e meses já emitidos, pro aviso de "cuota sem emissão neste mês"
      supabase
        .from("taxa_condominio")
        .select("id, titulo, ativo, taxa_condominio_unidades(count), faturamentos_competencia(competencia)")
        .returns<
          {
            id: string;
            titulo: string;
            ativo: boolean;
            taxa_condominio_unidades: { count: number }[];
            faturamentos_competencia: { competencia: string }[];
          }[]
        >(),
    ]);

  const loadError =
    cobrancasError ??
    taxaVinculosError ??
    cotacaoBcvError ??
    resumoError ??
    pendentesTotaisError ??
    taxasError;
  // a função devolve um único jsonb; sem os tipos gerados do banco, o cliente o tipa como lista
  const resumo = resumoRaw as ResumoDashboard | null;
  if (loadError || !resumo) {
    return (
      <p className="text-sm text-destructive">{t("loadError", { message: loadError?.message ?? "" })}</p>
    );
  }

  const mesSelecionado = formatMes(ano, mes);
  const resumoEntradas = montarResumoEntradas(resumo);

  // quitado = principal abatido pelos pagamentos do mês (em dólar, a moeda da dívida), e não o
  // valor recebido: somar bolívar convertido como se fosse caixa em dólar seria enganoso
  const evolucao: PontoEvolucao[] = resumo.evolucao.map((ponto) => ({
    mes: ponto.mes,
    rotulo: mesRotuloCurtoFormatter.format(new Date(`${ponto.mes}-01T00:00:00Z`)).replace(".", ""),
    emitido: ponto.emitido,
    quitado: ponto.quitado,
    emDia: percentualEmDia(ponto.baseEmDia, ponto.emDia),
  }));

  // conta unidades distintas vinculadas a alguma taxa (uma unidade pode estar em N taxas)
  const unidadesAtivas = new Set((taxaVinculosRaw ?? []).map((v) => v.unidade_id)).size;

  const cobrancas = cobrancasRaw ?? [];
  const ativas = cobrancas.filter((c) => c.status !== "cancelado");
  const valorEmitido = ativas.reduce((acc, c) => acc + c.valor_usd, 0);
  // centavos que os rateios do mês cobram a mais (ou a menos) que o total da despesa por causa do
  // arredondamento do valor por unidade: o emitido soma as cobranças, não o total das despesas.
  // Todas as cobranças de um rateio têm a mesma competência (o vencimento), então caem neste mês
  const cobrancasPorRateio = new Map<string, { despesa: NonNullable<CobrancaDoMes["despesa"]>; qtd: number }>();
  for (const c of cobrancas) {
    if (!c.despesa) continue;
    const item = cobrancasPorRateio.get(c.despesa.id) ?? { despesa: c.despesa, qtd: 0 };
    item.qtd += 1;
    cobrancasPorRateio.set(c.despesa.id, item);
  }
  const diferencaRedondeo =
    Math.round(
      [...cobrancasPorRateio.values()].reduce(
        (acc, { despesa, qtd }) =>
          acc + diferencaArredondamento(despesa.valor_total_usd, despesa.valor_por_unidade_usd, qtd),
        0,
      ) * 100,
    ) / 100;
  // quitado com crédito não é dinheiro novo entrando no mês: fica separado do quitado com pagamento
  const valorQuitadoComCredito = ativas.reduce((acc, c) => acc + c.valor_credito_abatido_usd, 0);
  // só principal: o emitido não inclui multa/juros, então somá-los aqui faria o quitado passar do
  // emitido. Os encargos pagos aparecem à parte no card de arrecadação
  let valorQuitadoComPagamento = 0;
  let quitadoDepoisDoMes = 0;
  let encargosCobrados = 0;
  for (const c of ativas) {
    for (const p of c.pagamento_cobrancas) {
      valorQuitadoComPagamento += p.valor_principal_abatido_usd;
      encargosCobrados += p.valor_juros_pago_usd;
      // pago num mês de caixa posterior: recuperado depois, não arrecadado dentro do mês
      if (p.pagamento && mesCaixaCaracas(p.pagamento.data_pagamento) > mesSelecionado) {
        quitadoDepoisDoMes += p.valor_principal_abatido_usd;
      }
    }
  }
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
  const recaudacao = {
    emitido: valorEmitido,
    // saldo a favor é aplicado na emissão, então conta como quitado dentro do mês
    quitadoNoMes: valorArrecadado - quitadoDepoisDoMes,
    quitadoDepois: quitadoDepoisDoMes,
    emAberto: valorEmAberto,
    encargos: encargosCobrados,
    // a janela do gráfico termina no mês selecionado: o último ponto é a pontualidade dele
    percentualEmDia: evolucao.at(-1)?.emDia ?? null,
  };

  // a cotação é atualizada pelo cron; se a mais recente for anterior ao último dia útil (no fuso de
  // Caracas), a atualização falhou e liquidações em VES usariam uma taxa vencida. Comparar com hoje
  // dava aviso falso todo fim de semana: a DolarApi (fonte principal) só traz a taxa de segunda
  // quando ela passa a valer, então no sábado e no domingo a mais recente é a de sexta.
  const cotacaoDesatualizada = !cotacaoBcv || cotacaoBcv.data_cotacao < ultimoDiaUtil(hojeCaracas);

  // pelo mês de hoje, não pelo selecionado: o aviso é sobre a emissão que falta fazer agora
  const mesDeHoje = hojeCaracas.slice(0, 7);
  const taxasSemEmissao = taxasSemEmissaoNoMes(
    (taxasRaw ?? []).map((taxa) => ({
      id: taxa.id,
      titulo: taxa.titulo,
      ativo: taxa.ativo,
      unidadesVinculadas: taxa.taxa_condominio_unidades[0]?.count ?? 0,
      competenciasEmitidas: taxa.faturamentos_competencia.map((f) => f.competencia),
    })),
    mesDeHoje,
  );
  const mesDeHojeLabel = mesLabelFormatter.format(new Date(`${mesDeHoje}-01T00:00:00Z`));

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

      {taxasSemEmissao.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              {t("feesNotIssued", {
                count: taxasSemEmissao.length,
                month: mesDeHojeLabel,
                names: taxasSemEmissao.map((taxa) => taxa.titulo).join(", "),
              })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={taxasSemEmissao.length === 1 ? `/taxas-condominio/${taxasSemEmissao[0].id}` : "/taxas-condominio"}
              />
            }
          >
            {t("goToFees")}
          </Button>
        </div>
      )}

      <DeudaTotal
        cobrancas={pendentesTotaisRaw ?? []}
        hojeIso={hojeIso}
        tasaVes={cotacaoBcv?.tasa_ves ?? null}
      />

      <EntradasDoMes usd={resumoEntradas.usd} ves={resumoEntradas.ves} mes={mesSelecionado}>
        <QuitacaoDoMes quitacao={resumoEntradas.quitacao} />
      </EntradasDoMes>

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
                {diferencaRedondeo !== 0 &&
                  ` · ${t("issuedRounding", { diff: formatDiferenca(diferencaRedondeo) })}`}
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

        <RecaudacaoDoMes recaudacao={recaudacao} unidadesAtivas={unidadesAtivas} />
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
              labels={{ emitido: t("chartIssued"), quitado: t("chartSettled"), emDia: t("chartOnTime") }}
            />
          </CardContent>
          <CardFooter className="items-start gap-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <p>{t("evolutionNote")}</p>
          </CardFooter>
        </Card>

        <Card size="sm" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("pendingChargesTitle")}</CardTitle>
            <CardDescription>
              {t("pendingChargesDescription")}
              {pendentes.length > 0 && ` · ${t("chargesCount", { count: pendentes.length })}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPendingCharges")}</p>
            ) : (
              // lista completa com rolagem: cortar sem aviso fazia o card mostrar menos cobranças
              // do que o contador "Pendientes"
              <ul className="-mr-2 flex max-h-96 flex-col gap-3 overflow-y-auto pr-2">
                {linhasPendentes.map(({ cobranca: c, encargos }) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{c.unidade?.identificacao ?? t("unitRemoved")}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {c.taxa?.titulo ?? c.despesa?.titulo ?? c.descricao}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dueOn", { date: formatDate(c.data_vencimento) })}
                        {/* os dias de atraso contam do fim da carência, não do vencimento */}
                        {c.dias_graca > 0 &&
                          ` · ${t("graceUntil", { date: formatDate(somarDias(c.data_vencimento, c.dias_graca)) })}`}
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
                        {/* saldo devedor (+ encargos se vencida), não o valor original: um abono
                            parcial já reduziu o que falta pagar */}
                        <span className="font-medium">{formatUsd(encargos.valorTotalComEncargos)}</span>
                        {cotacaoBcv && (
                          <p className="text-xs text-muted-foreground">
                            {formatVes(encargos.valorTotalComEncargos, cotacaoBcv.tasa_ves)}
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
