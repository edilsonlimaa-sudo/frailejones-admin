import { ChevronLeftIcon, ChevronRightIcon, Receipt } from "lucide-react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";

import type { UnidadeCobrancaDoMes } from "@/lib/types/cobrancas";
import { calcularEncargos } from "@/lib/encargos";
import { formatUsd, encontrarTasaNaData, type CotacaoHistorico } from "@/lib/moeda";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CobrancasEmitidasList } from "@/components/admin/taxas-condominio/cobrancas-emitidas-list";
import { EmitirCobrancasDoMesButton } from "@/components/admin/taxas-condominio/emitir-cobrancas-do-mes-button";
import { VincularUnidadesTaxaForm } from "@/components/admin/taxas-condominio/vincular-unidades-taxa-form";

type TaxaCondominioDetailTabsProps = {
  taxaId: string;
  valorUsd: number;
  pctMultaAtraso: number;
  pctJurosDiario: number;
  diasGraca: number;
  competencia: string;
  dataVencimento: string;
  mesLabelCapitalizado: string;
  mesAnteriorHref: string;
  mesSeguinteHref: string;
  unidadesDoMes: UnidadeCobrancaDoMes[];
  todasUnidades: { id: string; identificacao: string; proprietario: { id: string; nome: string } | null }[];
  unidadesVinculadasIds: string[];
  competenciaFaturada: boolean;
  dataProcessamento: string | null;
  cotacoes: CotacaoHistorico[];
};

export async function TaxaCondominioDetailTabs({
  taxaId,
  valorUsd,
  pctMultaAtraso,
  pctJurosDiario,
  diasGraca,
  competencia,
  dataVencimento,
  mesLabelCapitalizado,
  mesAnteriorHref,
  mesSeguinteHref,
  unidadesDoMes,
  todasUnidades,
  unidadesVinculadasIds,
  competenciaFaturada,
  dataProcessamento,
  cotacoes,
}: TaxaCondominioDetailTabsProps) {
  const t = await getTranslations("taxaCondominioDetail");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" });
  const cotacaoAtual = cotacoes[0] ?? null;
  const emitidas = unidadesDoMes.filter((u) => u.cobranca !== null);
  const naoEmitidas = unidadesDoMes.filter((u) => u.cobranca === null);
  const emitidasAtivas = emitidas.filter((u) => u.cobranca!.status !== "cancelado");
  const pagas = emitidas.filter((u) => u.cobranca!.status === "pago").length;
  const pendentes = emitidas.filter((u) => u.cobranca!.status === "pendente").length;

  const hojeIso = new Date().toISOString().slice(0, 10);
  const linhasEmitidas = emitidas.map((item) => {
    const cobranca = item.cobranca!;
    const encargos = calcularEncargos(cobranca, hojeIso);
    // já quitada: mostra o que foi de fato pago (histórico), não o saldo dinâmico (que já é 0)
    const multaJuros =
      encargos.diasAtraso > 0 ? encargos.valorMulta + encargos.valorJuros : cobranca.valor_juros_pago_usd;
    const totalAtualizado =
      encargos.diasAtraso > 0
        ? encargos.valorTotalComEncargos
        : cobranca.status === "pendente"
          ? encargos.saldoDevedor
          : cobranca.valor_principal_pago_usd + cobranca.valor_juros_pago_usd;
    // pendente: cotação de hoje (ainda vai pagar); já liquidada: cotação congelada na data do pagamento
    const tasaVesExibir =
      cobranca.status === "pendente"
        ? (cotacaoAtual?.tasa_ves ?? null)
        : encontrarTasaNaData(
            cotacoes,
            (cobranca.data_ultimo_pagamento ?? cobranca.data_vencimento).slice(0, 10),
          );
    return {
      unidadeId: item.unidade_id,
      unidadeIdentificacao: item.unidade_identificacao,
      unidadeProprietarioNome: item.unidade_proprietario_nome,
      cobranca,
      encargos,
      multaJuros,
      totalAtualizado,
      tasaVesExibir,
    };
  });

  const valorEmitido = emitidasAtivas.reduce((acc, u) => acc + u.cobranca!.valor_usd, 0);
  // só principal (pago ou abatido com saldo a favor): o emitido não inclui multa/juros, então
  // somá-los aqui inflaria o progresso. Os encargos pagos aparecem à parte
  const valorArrecadado = emitidasAtivas.reduce(
    (acc, u) => acc + u.cobranca!.valor_credito_abatido_usd + u.cobranca!.valor_principal_pago_usd,
    0,
  );
  const encargosCobrados = emitidasAtivas.reduce((acc, u) => acc + u.cobranca!.valor_juros_pago_usd, 0);
  const progresso = valorEmitido > 0 ? Math.min(100, (valorArrecadado / valorEmitido) * 100) : 0;

  return (
    <Tabs defaultValue="emissao" className="gap-4">
      <TabsList>
        <TabsTrigger value="emissao">{t("tabs.emission")}</TabsTrigger>
        <TabsTrigger value="unidades">{t("tabs.linkedUnits")}</TabsTrigger>
      </TabsList>

      <TabsContent value="emissao" className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {mesLabelCapitalizado}
                {competenciaFaturada && <Badge variant="outline">{t("processed")}</Badge>}
              </CardTitle>
              <CardDescription>
                {t("unitsWithChargeIssued", { count: emitidas.length, total: unidadesDoMes.length })}
                {competenciaFaturada &&
                  dataProcessamento &&
                  t("closedOn", { date: dateTimeFormatter.format(new Date(dataProcessamento)) })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("previousMonth")}
                nativeButton={false}
                render={<Link href={mesAnteriorHref} />}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("nextMonth")}
                nativeButton={false}
                render={<Link href={mesSeguinteHref} />}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress value={progresso} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">{t("collected")}</p>
                <p className="font-medium">{formatUsd(valorArrecadado)}</p>
                {encargosCobrados > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("collectedCharges", { value: formatUsd(encargosCobrados) })}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("issued")}</p>
                <p className="font-medium">{formatUsd(valorEmitido)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("paid")}</p>
                <p className="font-medium">{pagas}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("pending")}</p>
                <p className="font-medium">{pendentes}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("notIssued")}</p>
                <p className="font-medium">{naoEmitidas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("issuedChargesTitle", { month: mesLabelCapitalizado })}</CardTitle>
          </CardHeader>
          <CardContent>
            {unidadesDoMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noLinkedUnits")}</p>
            ) : emitidas.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input py-10 text-center">
                <Receipt className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("noChargesYet", { month: mesLabelCapitalizado.toLowerCase() })}
                </p>
                <EmitirCobrancasDoMesButton
                  taxaId={taxaId}
                  competencia={competencia}
                  dataVencimento={dataVencimento}
                  valorUsd={valorUsd}
                  pctMultaAtraso={pctMultaAtraso}
                  pctJurosDiario={pctJurosDiario}
                  diasGraca={diasGraca}
                  unidades={naoEmitidas.map((u) => ({
                    id: u.unidade_id,
                    identificacao: u.unidade_identificacao,
                  }))}
                  className="self-center"
                />
              </div>
            ) : (
              <CobrancasEmitidasList
                linhas={linhasEmitidas}
                naoEmitidas={naoEmitidas.map((u) => ({
                  id: u.unidade_id,
                  identificacao: u.unidade_identificacao,
                }))}
                taxaId={taxaId}
                competencia={competencia}
                dataVencimento={dataVencimento}
                valorUsd={valorUsd}
                pctMultaAtraso={pctMultaAtraso}
                pctJurosDiario={pctJurosDiario}
                diasGraca={diasGraca}
              />
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
              taxaId={taxaId}
              todasUnidades={todasUnidades}
              unidadesVinculadasIds={unidadesVinculadasIds}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
