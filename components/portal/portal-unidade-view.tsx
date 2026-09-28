import { useTranslations, useLocale } from "next-intl";

import type { Proprietario, Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade, CobrancaStatus, CobrancaTipo } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, MovimentacaoTipo } from "@/lib/types/creditos";
import { calcularEncargos } from "@/lib/encargos";
import { encontrarTasaNaData, formatVes, type CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { VerPagamentoDialog } from "@/components/admin/cobrancas/ver-pagamento-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PortalUnidadeViewProps = {
  unidade: Omit<Unidade, "proprietario"> & { proprietario: Proprietario | null };
  cobrancas: CobrancaDaUnidade[];
  creditos: CreditoMovimentacao[];
  cotacoes: (CotacaoHistorico & { id: string })[];
};

// versão só-leitura de UnidadeDetailTabs pro portal público do condômino: mesma UI/dados, mas
// sem LiquidarCobrancaDialog (ação exclusiva do admin) — reusa os mesmos namespaces de i18n
export function PortalUnidadeView({ unidade, cobrancas, creditos, cotacoes }: PortalUnidadeViewProps) {
  const t = useTranslations("unidadeDetail");
  const tCobrancas = useTranslations("cobrancas");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const currencyFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const cobrancaTipoLabel: Record<CobrancaTipo, string> = {
    ordinaria: tCobrancas("tipo.ordinaria"),
    extraordinaria: tCobrancas("tipo.extraordinaria"),
  };
  const cobrancaStatusLabel: Record<CobrancaStatus, string> = {
    pendente: tCobrancas("status.pendente"),
    pago: tCobrancas("status.pago"),
    cancelado: tCobrancas("status.cancelado"),
  };
  const movimentacaoTipoLabel: Record<MovimentacaoTipo, string> = {
    ENTRADA: tCobrancas("creditType.ENTRADA"),
    SAIDA: tCobrancas("creditType.SAIDA"),
  };
  const cobrancaStatusVariant: Record<CobrancaStatus, "default" | "outline" | "destructive"> = {
    pendente: "outline",
    pago: "default",
    cancelado: "destructive",
  };
  const movimentacaoTipoVariant: Record<MovimentacaoTipo, "default" | "secondary"> = {
    ENTRADA: "default",
    SAIDA: "secondary",
  };
  const cotacaoAtual = cotacoes[0] ?? null;

  const detalhesPorId = new Map<string, { valorEquivalenteExibido: number; saldoAcumulado: number }>();
  let saldoRunning = 0;
  [...creditos].reverse().forEach((credito) => {
    const valorEquivalenteExibido =
      credito.moeda === "VES" && cotacaoAtual
        ? Number((credito.valor / cotacaoAtual.tasa_ves).toFixed(2))
        : credito.valor;
    saldoRunning += credito.tipo === "ENTRADA" ? valorEquivalenteExibido : -valorEquivalenteExibido;
    detalhesPorId.set(credito.id, { valorEquivalenteExibido, saldoAcumulado: Number(saldoRunning.toFixed(2)) });
  });
  const saldoUsd = Number(saldoRunning.toFixed(2));

  const linhasCredito = creditos.map((credito) => {
    const { valorEquivalenteExibido, saldoAcumulado } = detalhesPorId.get(credito.id)!;
    const cobrancaRelacionada = credito.tipo === "SAIDA" ? credito.cobranca : (credito.pagamento?.cobranca ?? null);
    const dataPagamento = credito.tipo === "ENTRADA" ? (credito.pagamento?.data_pagamento ?? null) : null;
    return { credito, valorEquivalenteExibido, saldoAcumulado, cobrancaRelacionada, dataPagamento };
  });

  const hojeIso = new Date().toISOString().slice(0, 10);
  const linhasCobranca = cobrancas.map((cobranca) => {
    const encargos = calcularEncargos(cobranca, hojeIso);
    const multaJuros =
      encargos.diasAtraso > 0 ? encargos.valorMulta + encargos.valorJuros : cobranca.valor_juros_pago_usd;
    const totalAtualizado =
      encargos.diasAtraso > 0
        ? encargos.valorTotalComEncargos
        : cobranca.status === "pendente"
          ? encargos.saldoDevedor
          : cobranca.valor_principal_pago_usd + cobranca.valor_juros_pago_usd;
    const tasaVesExibir =
      cobranca.status === "pendente"
        ? (cotacaoAtual?.tasa_ves ?? null)
        : encontrarTasaNaData(
            cotacoes,
            (cobranca.data_ultimo_pagamento ?? cobranca.data_vencimento).slice(0, 10),
          );
    return { cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir };
  });

  return (
    <Tabs defaultValue="geral">
      <TabsList>
        <TabsTrigger value="geral">{t("tabs.general")}</TabsTrigger>
        <TabsTrigger value="cobrancas">{t("tabs.charges")}</TabsTrigger>
        <TabsTrigger value="creditos">{t("tabs.creditStatement")}</TabsTrigger>
      </TabsList>

      <TabsContent value="geral">
        <Card>
          <CardHeader>
            <CardTitle>{t("general.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.identification")}</dt>
                <dd className="font-medium">{unidade.identificacao}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.owner")}</dt>
                <dd className="font-medium">{unidade.proprietario?.nome ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.document")}</dt>
                <dd className="font-medium">{unidade.proprietario?.documento_identidad ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.phone")}</dt>
                <dd className="font-medium">{unidade.proprietario?.telefone_whatsapp ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.email")}</dt>
                <dd className="font-medium">{unidade.proprietario?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.creditBalance")}</dt>
                <dd className="font-medium">{currencyFormatter.format(saldoUsd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.createdAt")}</dt>
                <dd className="font-medium">{dateTimeFormatter.format(new Date(unidade.created_at))}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cobrancas">
        <Card>
          <CardHeader>
            <CardTitle>{t("tabs.charges")}</CardTitle>
          </CardHeader>
          <CardContent>
            {cobrancas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("charges.empty")}</p>
            ) : (
              <>
                {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {linhasCobranca.map(({ cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => (
                    <div key={cobranca.id} className="rounded-lg border border-input p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{cobranca.descricao}</span>
                        <Badge variant={cobrancaStatusVariant[cobranca.status]}>
                          {cobrancaStatusLabel[cobranca.status]}
                        </Badge>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("charges.competencia")}</dt>
                          <dd>{formatDate(cobranca.competencia)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("charges.type")}</dt>
                          <dd>{cobrancaTipoLabel[cobranca.tipo]}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("charges.value")}</dt>
                          <dd>
                            {currencyFormatter.format(cobranca.valor_usd)}
                            {cobranca.valor_credito_abatido_usd > 0 && (
                              <span className="block text-xs text-primary">
                                {t("charges.creditApplied", { value: currencyFormatter.format(cobranca.valor_credito_abatido_usd) })}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("charges.dueDate")}</dt>
                          <dd>
                            {formatDate(cobranca.data_vencimento)}
                            {encargos.diasAtraso > 0 && (
                              <span className="block text-xs text-destructive">
                                {tCobrancas("status.daysOverdue", { count: encargos.diasAtraso })}
                              </span>
                            )}
                          </dd>
                        </div>
                        {multaJuros > 0 && (
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("charges.penaltyInterest")}</dt>
                            <dd>{currencyFormatter.format(multaJuros)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("charges.updatedTotal")}</dt>
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
                      {cobranca.pagamentos.length > 0 && (
                        <div className="mt-3">
                          <VerPagamentoDialog
                            descricao={cobranca.descricao}
                            dataVencimento={cobranca.data_vencimento}
                            diasGraca={cobranca.dias_graca}
                            pagamentos={cobranca.pagamentos}
                            cotacoes={cotacoes}
                            triggerClassName="w-full"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("charges.competencia")}</TableHead>
                      <TableHead>{t("charges.type")}</TableHead>
                      <TableHead>{t("charges.description")}</TableHead>
                      <TableHead>{t("charges.value")}</TableHead>
                      <TableHead>{t("charges.dueDate")}</TableHead>
                      <TableHead>{t("charges.penaltyInterest")}</TableHead>
                      <TableHead>{t("charges.updatedTotal")}</TableHead>
                      <TableHead>{t("charges.status")}</TableHead>
                      <TableHead>{t("charges.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasCobranca.map(({ cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => (
                      <TableRow key={cobranca.id}>
                        <TableCell>{formatDate(cobranca.competencia)}</TableCell>
                        <TableCell>{cobrancaTipoLabel[cobranca.tipo]}</TableCell>
                        <TableCell>{cobranca.descricao}</TableCell>
                        <TableCell>
                          {currencyFormatter.format(cobranca.valor_usd)}
                          {cobranca.valor_credito_abatido_usd > 0 && (
                            <span className="block text-xs text-primary">
                              {t("charges.creditApplied", { value: currencyFormatter.format(cobranca.valor_credito_abatido_usd) })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {formatDate(cobranca.data_vencimento)}
                          {encargos.diasAtraso > 0 && (
                            <span className="block text-xs text-destructive">
                              {tCobrancas("status.daysOverdue", { count: encargos.diasAtraso })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{multaJuros > 0 ? currencyFormatter.format(multaJuros) : "—"}</TableCell>
                        <TableCell className="font-medium">
                          {currencyFormatter.format(totalAtualizado)}
                          {tasaVesExibir != null && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {formatVes(totalAtualizado, tasaVesExibir)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cobrancaStatusVariant[cobranca.status]}>
                            {cobrancaStatusLabel[cobranca.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cobranca.pagamentos.length > 0 ? (
                            <VerPagamentoDialog
                              descricao={cobranca.descricao}
                              dataVencimento={cobranca.data_vencimento}
                              diasGraca={cobranca.dias_graca}
                              pagamentos={cobranca.pagamentos}
                              cotacoes={cotacoes}
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="creditos">
        <Card>
          <CardHeader>
            <CardTitle>{t("tabs.creditStatement")}</CardTitle>
          </CardHeader>
          <CardContent>
            {creditos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("credits.empty")}</p>
            ) : (
              <>
                {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {linhasCredito.map(
                    ({ credito, valorEquivalenteExibido, saldoAcumulado, cobrancaRelacionada, dataPagamento }) => (
                      <div key={credito.id} className="rounded-lg border border-input p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {dateTimeFormatter.format(new Date(credito.created_at))}
                          </span>
                          <Badge variant={movimentacaoTipoVariant[credito.tipo]}>
                            {movimentacaoTipoLabel[credito.tipo]}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("credits.value")}</dt>
                            <dd>
                              {credito.valor} {credito.moeda}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("credits.equivalentUsd")}</dt>
                            <dd>
                              {currencyFormatter.format(valorEquivalenteExibido)}
                              {credito.moeda === "VES" && cotacaoAtual && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {t("credits.todayRate", { rate: cotacaoAtual.tasa_ves })}
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">
                              {credito.tipo === "ENTRADA" ? t("credits.origin") : t("credits.appliedTo")}
                            </dt>
                            <dd>
                              {cobrancaRelacionada ? (
                                <>
                                  <span className="block font-medium">{cobrancaRelacionada.descricao}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {t("credits.competencia", { date: formatDate(cobrancaRelacionada.competencia) })}
                                  </span>
                                  {dataPagamento && (
                                    <span className="block text-xs text-muted-foreground">
                                      {t("credits.paidOn", { date: dateTimeFormatter.format(new Date(dataPagamento)) })}
                                    </span>
                                  )}
                                </>
                              ) : (
                                (credito.descricao ?? "—")
                              )}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">{t("credits.runningBalance")}</dt>
                            <dd className="font-medium">{currencyFormatter.format(saldoAcumulado)}</dd>
                          </div>
                        </dl>
                      </div>
                    ),
                  )}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("credits.date")}</TableHead>
                      <TableHead>{t("credits.type")}</TableHead>
                      <TableHead>{t("credits.value")}</TableHead>
                      <TableHead>{t("credits.equivalentUsd")}</TableHead>
                      <TableHead>{t("credits.originHeader")}</TableHead>
                      <TableHead>{t("credits.runningBalance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasCredito.map(
                      ({ credito, valorEquivalenteExibido, saldoAcumulado, cobrancaRelacionada, dataPagamento }) => (
                        <TableRow key={credito.id}>
                          <TableCell>{dateTimeFormatter.format(new Date(credito.created_at))}</TableCell>
                          <TableCell>
                            <Badge variant={movimentacaoTipoVariant[credito.tipo]}>
                              {movimentacaoTipoLabel[credito.tipo]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {credito.valor} {credito.moeda}
                          </TableCell>
                          <TableCell>
                            {currencyFormatter.format(valorEquivalenteExibido)}
                            {credito.moeda === "VES" && cotacaoAtual && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {t("credits.todayRate", { rate: cotacaoAtual.tasa_ves })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {cobrancaRelacionada ? (
                              <>
                                <span className="block font-medium">{cobrancaRelacionada.descricao}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {t("credits.competencia", { date: formatDate(cobrancaRelacionada.competencia) })}
                                </span>
                                {dataPagamento && (
                                  <span className="block text-xs text-muted-foreground">
                                    {t("credits.paidOn", { date: dateTimeFormatter.format(new Date(dataPagamento)) })}
                                  </span>
                                )}
                              </>
                            ) : (
                              (credito.descricao ?? "—")
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{currencyFormatter.format(saldoAcumulado)}</TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
