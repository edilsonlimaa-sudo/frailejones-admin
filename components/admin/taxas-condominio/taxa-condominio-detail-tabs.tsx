import { ChevronLeftIcon, ChevronRightIcon, Receipt } from "lucide-react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";

import type { CobrancasOrganizadas, FiltroCobrancas } from "@/lib/lista-cobrancas";
import { formatUsd, type CotacaoHistorico } from "@/lib/moeda";
import type { ResumoProgresso, SituacaoProgresso } from "@/lib/progresso-cobranca";
import { ABA_TAXA_PADRAO, type AbaTaxa } from "@/lib/taxas";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsNaUrl } from "@/components/tabs-na-url";
import { ListaCobrancas } from "@/components/unidades/lista-cobrancas";
import { EmitirCobrancasDoMesButton } from "@/components/admin/taxas-condominio/emitir-cobrancas-do-mes-button";
import { VincularUnidadesTaxaForm } from "@/components/admin/taxas-condominio/vincular-unidades-taxa-form";

type TaxaCondominioDetailTabsProps = {
  abaInicial: AbaTaxa;
  filtroInicial: FiltroCobrancas;
  taxa: TaxaCondominio;
  mes: { label: string; competencia: string; dataVencimento: string; anteriorHref: string; seguinteHref: string };
  // cobranças emitidas no mês (uma por unidade), organizadas em pendentes/histórico
  organizadas: CobrancasOrganizadas;
  resumo: ResumoProgresso;
  pagasEmDia: number;
  pagasComAtraso: number;
  // unidades vinculadas ainda sem cobrança neste mês (só antes de o mês ser fechado)
  naoEmitidas: { id: string; identificacao: string }[];
  competenciaFaturada: boolean;
  dataProcessamento: string | null;
  todasUnidades: { id: string; identificacao: string; proprietario: { id: string; nome: string } | null }[];
  unidadesVinculadasIds: string[];
  cotacoes: (CotacaoHistorico & { id: string })[];
};

const situacaoVariant: Record<SituacaoProgresso, "default" | "outline" | "destructive"> = {
  concluido: "default",
  porVencer: "outline",
  enCobro: "destructive",
};

export async function TaxaCondominioDetailTabs({
  abaInicial,
  filtroInicial,
  taxa,
  mes,
  organizadas,
  resumo,
  pagasEmDia,
  pagasComAtraso,
  naoEmitidas,
  competenciaFaturada,
  dataProcessamento,
  todasUnidades,
  unidadesVinculadasIds,
  cotacoes,
}: TaxaCondominioDetailTabsProps) {
  const t = await getTranslations("taxaCondominioDetail");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Caracas",
  });
  // percentuais vêm do banco como número cru (0.1): formata no idioma da tela (0,1)
  const formatPercentual = (valor: number) =>
    new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 4 }).format(valor);
  const emitidas = resumo.cobrancas;
  const progresso = resumo.esperado > 0 ? Math.min(100, (resumo.recaudado / resumo.esperado) * 100) : 0;

  const botaoEmitir = (
    <EmitirCobrancasDoMesButton
      taxaId={taxa.id}
      competencia={mes.competencia}
      dataVencimento={mes.dataVencimento}
      valorUsd={taxa.valor_usd}
      pctMultaAtraso={taxa.pct_multa_atraso}
      pctJurosDiario={taxa.pct_juros_diario}
      diasGraca={taxa.dias_graca}
      unidades={naoEmitidas}
      mesLabel={mes.label}
      className="self-center"
    />
  );

  return (
    <TabsNaUrl parametro="aba" abaInicial={abaInicial} abaPadrao={ABA_TAXA_PADRAO} className="gap-4">
      <TabsList>
        <TabsTrigger value="emision">{t("tabs.emission")}</TabsTrigger>
        <TabsTrigger value="unidades">{t("tabs.linkedUnits")}</TabsTrigger>
      </TabsList>

      <TabsContent value="emision" className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {mes.label}
                {competenciaFaturada && <Badge variant="outline">{t("processed")}</Badge>}
                {emitidas > 0 && (
                  <Badge variant={situacaoVariant[resumo.situacao]}>
                    {t(`situation.${resumo.situacao}`, { count: resumo.vencidas })}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {emitidas > 0
                  ? t("paidSummary", { paid: resumo.pagas, total: emitidas, onTime: pagasEmDia, late: pagasComAtraso })
                  : t("notIssuedYet")}
                {competenciaFaturada &&
                  dataProcessamento &&
                  t("closedOn", { date: dateTimeFormatter.format(new Date(dataProcessamento)) })}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("previousMonth")}
                nativeButton={false}
                render={<Link href={mes.anteriorHref} />}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("nextMonth")}
                nativeButton={false}
                render={<Link href={mes.seguinteHref} />}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {emitidas > 0 && (
              <>
                <Progress value={progresso} />
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("collected")}</dt>
                    <dd className="text-xl font-medium tabular-nums">{formatUsd(resumo.recaudado)}</dd>
                    {resumo.encargosPagos > 0 && (
                      <dd className="text-xs text-muted-foreground">
                        {t("collectedCharges", { value: formatUsd(resumo.encargosPagos) })}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("toCollect")}</dt>
                    <dd className={cn("text-xl font-medium tabular-nums", resumo.porCobrar > 0 && "text-destructive")}>
                      {formatUsd(resumo.porCobrar)}
                    </dd>
                    {resumo.pendentes > 0 && (
                      <dd className="text-xs text-muted-foreground">
                        {t("toCollectDetail", { count: resumo.pendentes })}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("issued")}</dt>
                    <dd className="text-xl font-medium tabular-nums">{formatUsd(resumo.esperado)}</dd>
                    <dd className="text-xs text-muted-foreground">{t("chargesCount", { count: emitidas })}</dd>
                  </div>
                </dl>
              </>
            )}
            {/* regras numa linha: valem pra emissão deste mês e ficam congeladas em cada cobrança */}
            <p className={cn("text-xs text-muted-foreground", emitidas > 0 && "border-t pt-4")}>
              {t("rules", {
                value: formatUsd(taxa.valor_usd),
                day: taxa.dia_vencimento,
                penalty: formatPercentual(taxa.pct_multa_atraso),
                interest: formatPercentual(taxa.pct_juros_diario),
                grace: taxa.dias_graca,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("issuedChargesTitle", { month: mes.label })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {emitidas === 0 && naoEmitidas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noLinkedUnits")}</p>
            ) : emitidas === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input py-10 text-center">
                <Receipt className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("noChargesYet", { month: mes.label.toLowerCase(), count: naoEmitidas.length })}
                </p>
                {botaoEmitir}
              </div>
            ) : (
              <>
                <ListaCobrancas
                  organizadas={organizadas}
                  filtroInicial={filtroInicial}
                  podeLiquidar
                  cotacaoAtual={cotacoes[0] ?? null}
                  cotacoes={cotacoes}
                  comBusca
                />
                {/* unidade vinculada depois da emissão, antes de o mês fechar */}
                {naoEmitidas.length > 0 && (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-input p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("remainingUnits", { count: naoEmitidas.length })}
                    </p>
                    {botaoEmitir}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="unidades">
        <Card>
          <CardHeader>
            <CardTitle>{t("tabs.linkedUnits")}</CardTitle>
            <CardDescription>{t("linkedUnitsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VincularUnidadesTaxaForm
              taxaId={taxa.id}
              todasUnidades={todasUnidades}
              unidadesVinculadasIds={unidadesVinculadasIds}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </TabsNaUrl>
  );
}
