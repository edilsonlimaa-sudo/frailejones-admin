import { ChevronLeftIcon, ChevronRightIcon, Receipt } from "lucide-react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";

import type { UnidadeCobrancaDoMes } from "@/lib/types/cobrancas";
import { calcularEncargos } from "@/lib/encargos";
import { encontrarTasaNaData, formatVes, type CotacaoHistorico } from "@/lib/moeda";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const tCobrancas = await getTranslations("cobrancas.status");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const currencyFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" });
  const statusLabel = { pendente: tCobrancas("pendente"), pago: tCobrancas("pago"), cancelado: tCobrancas("cancelado") } as const;
  const statusVariant = {
    pendente: "outline",
    pago: "default",
    cancelado: "destructive",
  } as const;
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
    return { item, encargos, multaJuros, totalAtualizado, tasaVesExibir };
  });

  const valorEmitido = emitidasAtivas.reduce((acc, u) => acc + u.cobranca!.valor_usd, 0);
  const valorArrecadado = emitidasAtivas.reduce(
    (acc, u) =>
      acc +
      u.cobranca!.valor_credito_abatido_usd +
      u.cobranca!.valor_principal_pago_usd +
      u.cobranca!.valor_juros_pago_usd,
    0,
  );
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
                <p className="font-medium">{currencyFormatter.format(valorArrecadado)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("issued")}</p>
                <p className="font-medium">{currencyFormatter.format(valorEmitido)}</p>
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
              <div className="flex flex-col gap-4">
                {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {linhasEmitidas.map(({ item, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => {
                    const cobranca = item.cobranca!;
                    const totalAbatido =
                      cobranca.valor_credito_abatido_usd +
                      cobranca.valor_principal_pago_usd +
                      cobranca.valor_juros_pago_usd;

                    return (
                      <div key={cobranca.id} className="rounded-lg border border-input p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <Link
                              href={`/unidades/${item.unidade_id}`}
                              className="font-medium underline-offset-2 hover:underline"
                            >
                              {item.unidade_identificacao}
                            </Link>
                            {item.unidade_proprietario_nome && (
                              <span className="block text-xs text-muted-foreground">
                                {item.unidade_proprietario_nome}
                              </span>
                            )}
                          </div>
                          <Badge variant={statusVariant[cobranca.status]}>
                            {statusLabel[cobranca.status]}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("value")}</dt>
                            <dd>
                              {currencyFormatter.format(cobranca.valor_usd)}
                              {cobranca.valor_credito_abatido_usd > 0 && (
                                <span className="block text-xs text-primary">
                                  {t("creditApplied", { value: currencyFormatter.format(cobranca.valor_credito_abatido_usd) })}
                                </span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("paidValue")}</dt>
                            <dd>{currencyFormatter.format(totalAbatido)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("balance")}</dt>
                            <dd>{currencyFormatter.format(encargos.saldoDevedor)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("dueDate")}</dt>
                            <dd>
                              {formatDate(cobranca.data_vencimento)}
                              {encargos.diasAtraso > 0 && (
                                <span className="block text-xs text-destructive">
                                  {tCobrancas("daysOverdue", { count: encargos.diasAtraso })}
                                </span>
                              )}
                            </dd>
                          </div>
                          {multaJuros > 0 && (
                            <div>
                              <dt className="text-xs text-muted-foreground">{t("penaltyInterest")}</dt>
                              <dd>{currencyFormatter.format(multaJuros)}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("updatedTotal")}</dt>
                            <dd className="font-medium">
                              {currencyFormatter.format(totalAtualizado)}
                              {tasaVesExibir != null && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {formatVes(totalAtualizado, tasaVesExibir)}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("unit")}</TableHead>
                      <TableHead>{t("owner")}</TableHead>
                      <TableHead>{t("value")}</TableHead>
                      <TableHead>{t("paidValue")}</TableHead>
                      <TableHead>{t("balance")}</TableHead>
                      <TableHead>{t("dueDate")}</TableHead>
                      <TableHead>{t("penaltyInterest")}</TableHead>
                      <TableHead>{t("updatedTotal")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasEmitidas.map(({ item, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => {
                      const cobranca = item.cobranca!;
                      const totalAbatido =
                        cobranca.valor_credito_abatido_usd +
                        cobranca.valor_principal_pago_usd +
                        cobranca.valor_juros_pago_usd;

                      return (
                        <TableRow key={cobranca.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/unidades/${item.unidade_id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {item.unidade_identificacao}
                            </Link>
                          </TableCell>
                          <TableCell>{item.unidade_proprietario_nome ?? "—"}</TableCell>
                          <TableCell>
                            {currencyFormatter.format(cobranca.valor_usd)}
                            {cobranca.valor_credito_abatido_usd > 0 && (
                              <span className="block text-xs text-primary">
                                {t("creditApplied", { value: currencyFormatter.format(cobranca.valor_credito_abatido_usd) })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{currencyFormatter.format(totalAbatido)}</TableCell>
                          <TableCell>{currencyFormatter.format(encargos.saldoDevedor)}</TableCell>
                          <TableCell>
                            {formatDate(cobranca.data_vencimento)}
                            {encargos.diasAtraso > 0 && (
                              <span className="block text-xs text-destructive">
                                {tCobrancas("daysOverdue", { count: encargos.diasAtraso })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {multaJuros > 0 ? currencyFormatter.format(multaJuros) : "—"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {currencyFormatter.format(totalAtualizado)}
                            {tasaVesExibir != null && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {formatVes(totalAtualizado, tasaVesExibir)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[cobranca.status]}>
                              {statusLabel[cobranca.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {naoEmitidas.length > 0 && (
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
                  />
                )}
              </div>
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
