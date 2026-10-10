import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { dataCaixaCaracas } from "@/lib/arrecadacao";
import {
  montarCobrancaDetalhada,
  SELECT_COBRANCA_DETALHADA,
  type CobrancaDetalhadaRow,
} from "@/lib/cobrancas-detalhadas";
import { organizarCobrancas, resolverFiltroCobrancas } from "@/lib/lista-cobrancas";
import { formatUsd } from "@/lib/moeda";
import { diferencaArredondamento, formatDiferenca } from "@/lib/rateios";
import { resumirProgresso, type SituacaoProgresso } from "@/lib/progresso-cobranca";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { cn } from "@/lib/utils";
import { ListaCobrancas } from "@/components/unidades/lista-cobrancas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type CobrancaDoRateioRow = CobrancaDetalhadaRow & {
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
};

const situacaoVariant: Record<SituacaoProgresso, "default" | "outline" | "destructive"> = {
  concluido: "default",
  porVencer: "outline",
  enCobro: "destructive",
};

export default async function RateioExtraordinarioDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtro?: string | string[] }>;
}) {
  const { id } = await params;
  const filtro = resolverFiltroCobrancas((await searchParams).filtro);
  const supabase = await createClient();
  const t = await getTranslations("common");
  const tRateio = await getTranslations("rateioExtraordinarioDetail");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const formatPercentual = (valor: number) =>
    new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 4 }).format(valor);

  const { data: despesa, error: despesaError } = await supabase
    .from("despesas_extraordinarias")
    .select(
      "id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (despesaError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: despesaError.message })}</p>;
  }

  if (!despesa) {
    notFound();
  }

  const [
    { data: cobrancasRaw, error: cobrancasError },
    { data: cotacoes, error: cotacaoBcvError },
    { count: totalUnidades, error: unidadesError },
  ] = await Promise.all([
    // uma cobrança por unidade participante; paginada pra condomínios grandes
    buscarTodas((de, ate) =>
      supabase
        .from("cobrancas")
        .select(`${SELECT_COBRANCA_DETALHADA}, unidade:unidades(id, identificacao, proprietario:proprietarios(nome))`, {
          count: "exact",
        })
        .eq("despesa_extraordinaria_id", id)
        .order("id")
        .range(de, ate)
        .returns<CobrancaDoRateioRow[]>(),
    ),
    supabase
      .from("cotacao_bcv")
      .select("id, data_cotacao, tasa_ves")
      .order("data_cotacao", { ascending: false })
      .limit(366)
      .returns<{ id: string; data_cotacao: string; tasa_ves: number }[]>(),
    // pra dizer "todas as unidades" quando o rateio foi pra todo o condomínio
    supabase.from("unidades").select("id", { count: "exact", head: true }),
  ]);

  const loadError = cobrancasError ?? cotacaoBcvError ?? unidadesError;
  if (loadError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: loadError.message })}</p>;
  }

  const linhas = cobrancasRaw ?? [];
  const cobrancas = linhas.map(montarCobrancaDetalhada);
  const unidadePorCobranca = new Map(linhas.map((c) => [c.id, c.unidade]));

  const agora = new Date();
  const resumo = resumirProgresso(cobrancas, agora.toISOString().slice(0, 10));
  const organizadas = organizarCobrancas(cobrancas, agora, {
    agruparPorMes: false,
    // no rateio cada linha é uma unidade (com o dono e link pra aba de cobranças dela)
    rotulo: (c) => {
      const unidade = unidadePorCobranca.get(c.id);
      return {
        titulo: unidade?.identificacao ?? "—",
        subtitulo: unidade?.proprietario?.nome ?? null,
        href: unidade ? `/unidades/${unidade.id}?aba=cobrancas` : null,
        extraordinaria: false,
      };
    },
  });

  const participantes = cobrancas.length;
  const diferencaRedondeo = diferencaArredondamento(
    despesa.valor_total_usd,
    despesa.valor_por_unidade_usd,
    participantes,
  );
  const progresso = resumo.esperado > 0 ? Math.min(100, (resumo.recaudado / resumo.esperado) * 100) : 0;
  const cotacaoLista = cotacoes ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("back")}
          nativeButton={false}
          render={<Link href="/rateios-extraordinarios" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-medium">{despesa.titulo}</h1>
          {despesa.descricao && <p className="text-sm text-muted-foreground">{despesa.descricao}</p>}
          <p className="text-xs text-muted-foreground">
            {tRateio("registeredOn", { date: formatDate(dataCaixaCaracas(despesa.created_at)) })}
            {" · "}
            {tRateio("dueOn", { date: formatDate(despesa.data_vencimento) })}
            {" · "}
            {participantes === totalUnidades
              ? tRateio("allUnits", { count: participantes })
              : tRateio("someUnits", { count: participantes })}
          </p>
        </div>
      </div>

      {/* 1º o que a junta quer saber: quanto já foi cobrado e quanto falta */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{tRateio("collectionTitle")}</CardTitle>
            <Badge variant={situacaoVariant[resumo.situacao]}>
              {tRateio(`situation.${resumo.situacao}`, { count: resumo.vencidas })}
            </Badge>
          </div>
          <CardDescription>
            {tRateio("paidCharges", { paid: resumo.pagas, total: resumo.cobrancas })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Progress value={progresso} />
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("collected")}</dt>
              <dd className="text-xl font-medium tabular-nums">{formatUsd(resumo.recaudado)}</dd>
              {resumo.encargosPagos > 0 && (
                <dd className="text-xs text-muted-foreground">
                  {tRateio("collectedCharges", { value: formatUsd(resumo.encargosPagos) })}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("toCollect")}</dt>
              <dd className={cn("text-xl font-medium tabular-nums", resumo.porCobrar > 0 && "text-destructive")}>
                {formatUsd(resumo.porCobrar)}
              </dd>
              {resumo.pendentes > 0 && (
                <dd className="text-xs text-muted-foreground">
                  {tRateio("toCollectDetail", { count: resumo.pendentes })}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("expected")}</dt>
              <dd className="text-xl font-medium tabular-nums">{formatUsd(resumo.esperado)}</dd>
              {diferencaRedondeo !== 0 && (
                <dd className="text-xs text-muted-foreground">
                  {tRateio("expectedRounding", {
                    total: formatUsd(despesa.valor_total_usd),
                    diff: formatDiferenca(diferencaRedondeo),
                  })}
                </dd>
              )}
            </div>
          </dl>
          {/* regras numa linha: iguais pra todas as unidades e congeladas em cada cobrança */}
          <div className="flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
            <p>
              {tRateio("rules", {
                value: formatUsd(despesa.valor_por_unidade_usd),
                // percentuais vêm do banco como número cru (0.1): formata no idioma da tela (0,1)
                penalty: formatPercentual(despesa.pct_multa_atraso),
                interest: formatPercentual(despesa.pct_juros_diario),
                grace: despesa.dias_graca,
              })}
            </p>
            <p>{tRateio("lockedNote", { date: formatDate(dataCaixaCaracas(despesa.created_at)), count: participantes })}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tRateio("chargesByUnitTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ListaCobrancas
            organizadas={organizadas}
            filtroInicial={filtro}
            podeLiquidar
            cotacaoAtual={cotacaoLista[0] ?? null}
            cotacoes={cotacaoLista}
          />
        </CardContent>
      </Card>
    </div>
  );
}
