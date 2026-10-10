import { useTranslations, useLocale } from "next-intl";

import type { Proprietario, Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade, CobrancaStatus, CobrancaTipo } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, MovimentacaoTipo } from "@/lib/types/creditos";
import { calcularEncargos } from "@/lib/encargos";
import { formatUsd, formatBs, encontrarTasaNaData, formatVes, type CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { LiquidarCobrancaDialog } from "@/components/admin/cobrancas/liquidar-cobranca-dialog";
import { VerPagamentoDialog } from "@/components/admin/cobrancas/ver-pagamento-dialog";
import { EstadoDeCuenta } from "@/components/unidades/estado-de-cuenta";
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

type UnidadeDetailTabsProps = {
  unidade: Omit<Unidade, "proprietario"> & { proprietario: Proprietario | null };
  cobrancas: CobrancaDaUnidade[];
  creditos: CreditoMovimentacao[];
  cotacoes: (CotacaoHistorico & { id: string })[];
};

export function UnidadeDetailTabs({ unidade, cobrancas, creditos, cotacoes }: UnidadeDetailTabsProps) {
  const t = useTranslations("unidadeDetail");
  const tCobrancas = useTranslations("cobrancas");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
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

  // ─── Carteiras separadas ────────────────────────────────────────────────────
  // Cada carteira acumula seu saldo na própria moeda — sem conversão cruzada.
  // SAÍDAs saem sempre da carteira cuja moeda corresponde à movimentação.

  const creditosUsd = creditos.filter((c) => c.moeda === "USD");
  const creditosVes = creditos.filter((c) => c.moeda === "VES");

  function calcularDetalhes(lista: CreditoMovimentacao[]) {
    const porId = new Map<string, { saldoAcumulado: number }>();
    let running = 0;
    [...lista].reverse().forEach((credito) => {
      running += credito.tipo === "ENTRADA" ? credito.valor : -credito.valor;
      porId.set(credito.id, { saldoAcumulado: Number(running.toFixed(2)) });
    });
    return { porId, saldoFinal: Number(running.toFixed(2)) };
  }

  const { porId: detalhesUsd, saldoFinal: saldoUsd } = calcularDetalhes(creditosUsd);
  const { porId: detalhesVes, saldoFinal: saldoVes } = calcularDetalhes(creditosVes);

  type LinhaCredito = {
    credito: CreditoMovimentacao;
    saldoAcumulado: number;
    cobrancaRelacionada: { id: string; descricao: string; competencia: string } | null;
    dataPagamento: string | null;
  };

  function buildLinhas(
    lista: CreditoMovimentacao[],
    porId: Map<string, { saldoAcumulado: number }>,
  ): LinhaCredito[] {
    return lista.map((credito) => {
      const { saldoAcumulado } = porId.get(credito.id)!;
      const cobrancaRelacionada =
        credito.tipo === "SAIDA" ? credito.cobranca : (credito.pagamento?.cobranca ?? null);
      const dataPagamento =
        credito.tipo === "ENTRADA" ? (credito.pagamento?.data_pagamento ?? null) : null;
      return { credito, saldoAcumulado, cobrancaRelacionada, dataPagamento };
    });
  }

  const linhasUsd = buildLinhas(creditosUsd, detalhesUsd);
  const linhasVes = buildLinhas(creditosVes, detalhesVes);

  // ─── Cobranças ─────────────────────────────────────────────────────────────
  const hojeIso = new Date().toISOString().slice(0, 10);
  const linhasCobranca = cobrancas.map((cobranca) => {
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
    return { cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir };
  });

  // ─── Extrato reutilizável ──────────────────────────────────────────────────
  function ExtratoTabela({
    linhas,
    moeda,
    empty,
  }: {
    linhas: LinhaCredito[];
    moeda: "USD" | "VES";
    empty: string;
  }) {
    const formatValor = (v: number) =>
      moeda === "USD" ? formatUsd(v) : formatBs(v);

    if (linhas.length === 0) {
      return <p className="text-sm text-muted-foreground">{empty}</p>;
    }

    return (
      <>
        {/* mobile: lista de cards */}
        <div className="flex flex-col gap-3 sm:hidden">
          {linhas.map(({ credito, saldoAcumulado, cobrancaRelacionada, dataPagamento }) => (
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
                  <dd>{formatValor(credito.valor)}</dd>
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
                          {t("credits.competencia", {
                            date: formatDate(cobrancaRelacionada.competencia),
                          })}
                        </span>
                        {dataPagamento && (
                          <span className="block text-xs text-muted-foreground">
                            {t("credits.paidOn", {
                              date: dateTimeFormatter.format(new Date(dataPagamento)),
                            })}
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
                  <dd className="font-medium">{formatValor(saldoAcumulado)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        {/* sm+: tabela */}
        <Table className="hidden sm:table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("credits.date")}</TableHead>
              <TableHead>{t("credits.type")}</TableHead>
              <TableHead>{t("credits.value")}</TableHead>
              <TableHead>{t("credits.originHeader")}</TableHead>
              <TableHead>{t("credits.runningBalance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map(({ credito, saldoAcumulado, cobrancaRelacionada, dataPagamento }) => (
              <TableRow key={credito.id}>
                <TableCell>{dateTimeFormatter.format(new Date(credito.created_at))}</TableCell>
                <TableCell>
                  <Badge variant={movimentacaoTipoVariant[credito.tipo]}>
                    {movimentacaoTipoLabel[credito.tipo]}
                  </Badge>
                </TableCell>
                <TableCell>{formatValor(credito.valor)}</TableCell>
                <TableCell>
                  {cobrancaRelacionada ? (
                    <>
                      <span className="block font-medium">{cobrancaRelacionada.descricao}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("credits.competencia", {
                          date: formatDate(cobrancaRelacionada.competencia),
                        })}
                      </span>
                      {dataPagamento && (
                        <span className="block text-xs text-muted-foreground">
                          {t("credits.paidOn", {
                            date: dateTimeFormatter.format(new Date(dataPagamento)),
                          })}
                        </span>
                      )}
                    </>
                  ) : (
                    (credito.descricao ?? "—")
                  )}
                </TableCell>
                <TableCell className="font-medium">{formatValor(saldoAcumulado)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    );
  }

  return (
    <Tabs defaultValue="geral">
      <TabsList>
        <TabsTrigger value="geral">{t("tabs.general")}</TabsTrigger>
        <TabsTrigger value="cobrancas">{t("tabs.charges")}</TabsTrigger>
        <TabsTrigger value="creditos">{t("tabs.creditStatement")}</TabsTrigger>
      </TabsList>

      <TabsContent value="geral" className="flex flex-col gap-6">
        <EstadoDeCuenta
          cobrancas={cobrancas}
          saldoFavorUsd={saldoUsd}
          saldoFavorVes={saldoVes}
          tasaVes={cotacaoAtual?.tasa_ves ?? null}
        />
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
                <dd className="font-medium">
                  {unidade.proprietario?.documento_identidad ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.phone")}</dt>
                <dd className="font-medium">
                  {unidade.proprietario?.telefone_whatsapp ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.email")}</dt>
                <dd className="font-medium">{unidade.proprietario?.email ?? "—"}</dd>
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
                            {formatUsd(cobranca.valor_usd)}
                            {cobranca.valor_credito_abatido_usd > 0 && (
                              <span className="block text-xs text-primary">
                                {t("charges.creditApplied", {
                                  value: formatUsd(cobranca.valor_credito_abatido_usd),
                                })}
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
                            <dd>{formatUsd(multaJuros)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("charges.updatedTotal")}</dt>
                          <dd className="font-medium">
                            {formatUsd(totalAtualizado)}
                            {tasaVesExibir != null && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {formatVes(totalAtualizado, tasaVesExibir)}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      {(cobranca.status === "pendente" || cobranca.pagamentos.length > 0) && (
                        <div className="mt-3 flex gap-2">
                          {cobranca.status === "pendente" && (
                            <LiquidarCobrancaDialog
                              cobrancaId={cobranca.id}
                              descricao={cobranca.descricao}
                              saldoDevedorUsd={encargos.saldoDevedor}
                              encargosUsd={encargos.valorMulta + encargos.valorJuros}
                              cotacaoBcv={cotacaoAtual}
                              triggerClassName="flex-1"
                            />
                          )}
                          {cobranca.pagamentos.length > 0 && (
                            <VerPagamentoDialog
                              cobranca={cobranca}
                              pagamentos={cobranca.pagamentos}
                              cotacoes={cotacoes}
                              triggerClassName="flex-1"
                            />
                          )}
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
                          {formatUsd(cobranca.valor_usd)}
                          {cobranca.valor_credito_abatido_usd > 0 && (
                            <span className="block text-xs text-primary">
                              {t("charges.creditApplied", {
                                value: formatUsd(cobranca.valor_credito_abatido_usd),
                              })}
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
                        <TableCell>
                          {multaJuros > 0 ? formatUsd(multaJuros) : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatUsd(totalAtualizado)}
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
                          <div className="flex gap-2">
                            {cobranca.status === "pendente" && (
                              <LiquidarCobrancaDialog
                                cobrancaId={cobranca.id}
                                descricao={cobranca.descricao}
                                saldoDevedorUsd={encargos.saldoDevedor}
                                encargosUsd={encargos.valorMulta + encargos.valorJuros}
                                cotacaoBcv={cotacaoAtual}
                              />
                            )}
                            {cobranca.pagamentos.length > 0 && (
                              <VerPagamentoDialog
                                cobranca={cobranca}
                                pagamentos={cobranca.pagamentos}
                                cotacoes={cotacoes}
                              />
                            )}
                          </div>
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
          <CardContent className="flex flex-col gap-6">
            {/* Resumo dos dois saldos — sempre visíveis simultaneamente */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-input bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">{t("credits.walletUsd")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatUsd(saldoUsd)}
                </p>
              </div>
              <div className="rounded-lg border border-input bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">{t("credits.walletVes")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatBs(saldoVes)}
                </p>
              </div>
            </div>

            {/* Sub-abas para alternar o extrato exibido */}
            <Tabs defaultValue="usd">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="usd" className="flex-1 sm:flex-none">
                  {t("credits.walletUsd")}
                </TabsTrigger>
                <TabsTrigger value="ves" className="flex-1 sm:flex-none">
                  {t("credits.walletVes")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="usd" className="mt-4">
                <ExtratoTabela linhas={linhasUsd} moeda="USD" empty={t("credits.emptyUsd")} />
              </TabsContent>

              <TabsContent value="ves" className="mt-4">
                <ExtratoTabela linhas={linhasVes} moeda="VES" empty={t("credits.emptyVes")} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
