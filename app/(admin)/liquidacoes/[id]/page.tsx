import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { CobrancaStatus, CobrancaTipo } from "@/lib/types/cobrancas";
import type {
  CobrancaDaLiquidacao,
  CreditoGeradoPeloPagamento,
  FormaPagamentoTipo,
  LiquidacaoDetalhe,
  PagamentoIrmao,
} from "@/lib/types/pagamentos";
import type { MoedaTipo } from "@/lib/types/creditos";
import { calcularDiasAtrasoNaData } from "@/lib/encargos";
import { encontrarTasaNaData, type CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const vesNumberFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// pagamento_cobrancas.pagamento_id é UNIQUE, então o embed reverso (a partir de pagamentos)
// vem como objeto único (ou null), não array
type PagamentoRow = Omit<
  LiquidacaoDetalhe,
  "cobranca" | "valor_principal_abatido_usd" | "valor_juros_pago_usd" | "creditosGerados"
> & {
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    cobranca: CobrancaDaLiquidacao | null;
  } | null;
  creditos_movimentacoes: CreditoGeradoPeloPagamento[];
};

type SiblingRow = {
  valor_principal_abatido_usd: number;
  valor_juros_pago_usd: number;
  pagamento: {
    id: string;
    data_pagamento: string;
    moeda: MoedaTipo;
    valor_recebido: number;
    valor_equivalente_usd: number;
  } | null;
};

export default async function LiquidacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("common");
  const tDetail = await getTranslations("liquidacaoDetail");
  const tLiquidacoes = await getTranslations("liquidacoes");
  const tCobrancas = await getTranslations("cobrancas");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const currencyFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" });
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
  const cobrancaStatusVariant: Record<CobrancaStatus, "default" | "outline" | "destructive"> = {
    pendente: "outline",
    pago: "default",
    cancelado: "destructive",
  };
  const formaPagamentoLabel: Record<FormaPagamentoTipo, string> = {
    pago_movil: tLiquidacoes("paymentMethod.pago_movil"),
    transferencia: tLiquidacoes("paymentMethod.transferencia"),
    efectivo_usd: tLiquidacoes("paymentMethod.efectivo_usd"),
    zelle: tLiquidacoes("paymentMethod.zelle"),
  };

  const { data: pagamentoRow, error: pagamentoError } = await supabase
    .from("pagamentos")
    .select(
      "id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, tasa_bcv_aplicada, forma_pagamento, referencia_bancaria, comprovante_url, observacao, unidade:unidades(id, identificacao, proprietario:proprietarios(id, nome)), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, cobranca:cobrancas(id, tipo, descricao, competencia, valor_usd, valor_credito_abatido_usd, data_emissao, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status)), creditos_movimentacoes(id, valor, moeda, descricao, created_at)",
    )
    .eq("id", id)
    .maybeSingle<PagamentoRow>();

  if (pagamentoError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: pagamentoError.message })}</p>;
  }

  if (!pagamentoRow) {
    notFound();
  }

  const pagamentoCobranca = pagamentoRow.pagamento_cobrancas ?? null;
  const cobranca = pagamentoCobranca?.cobranca ?? null;

  const [{ data: cotacoes, error: cotacaoError }, siblingsResult] = await Promise.all([
    supabase
      .from("cotacao_bcv")
      .select("data_cotacao, tasa_ves")
      .order("data_cotacao", { ascending: false })
      .limit(366)
      .returns<CotacaoHistorico[]>(),
    cobranca
      ? supabase
          .from("pagamento_cobrancas")
          .select(
            "valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd)",
          )
          .eq("cobranca_id", cobranca.id)
          .returns<SiblingRow[]>()
      : Promise.resolve({ data: [] as SiblingRow[], error: null }),
  ]);

  if (cotacaoError || siblingsResult.error) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", { message: cotacaoError?.message ?? siblingsResult.error?.message ?? "" })}
      </p>
    );
  }

  const todosPagamentosDaCobranca = siblingsResult.data ?? [];
  const totalPrincipalPago = todosPagamentosDaCobranca.reduce(
    (acc, p) => acc + p.valor_principal_abatido_usd,
    0,
  );
  const totalJurosPago = todosPagamentosDaCobranca.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0);
  const outrosPagamentos: PagamentoIrmao[] = todosPagamentosDaCobranca
    .filter((p): p is SiblingRow & { pagamento: NonNullable<SiblingRow["pagamento"]> } =>
      Boolean(p.pagamento && p.pagamento.id !== pagamentoRow.id),
    )
    .map((p) => ({
      id: p.pagamento.id,
      data_pagamento: p.pagamento.data_pagamento,
      moeda: p.pagamento.moeda,
      valor_recebido: p.pagamento.valor_recebido,
      valor_equivalente_usd: p.pagamento.valor_equivalente_usd,
      valor_principal_abatido_usd: p.valor_principal_abatido_usd,
      valor_juros_pago_usd: p.valor_juros_pago_usd,
    }))
    .sort((a, b) => (a.data_pagamento < b.data_pagamento ? 1 : -1));

  // sobra convertida na mesma tasa congelada deste pagamento (fato histórico)
  const creditoGeradoUsd = pagamentoRow.creditos_movimentacoes.reduce(
    (acc, c) =>
      acc +
      (c.moeda === "VES" && pagamentoRow.tasa_bcv_aplicada ? c.valor / pagamentoRow.tasa_bcv_aplicada : c.valor),
    0,
  );

  const dataPagamentoIso = pagamentoRow.data_pagamento.slice(0, 10);
  // VES: taxa exata usada neste pagamento; USD: cotação de referência do dia (informativa)
  const cotacaoDoPagamento =
    pagamentoRow.moeda === "VES"
      ? pagamentoRow.tasa_bcv_aplicada
      : encontrarTasaNaData(cotacoes ?? [], dataPagamentoIso);
  const diasAtrasoNoPagamento = cobranca
    ? calcularDiasAtrasoNaData(cobranca.data_vencimento, cobranca.dias_graca, dataPagamentoIso)
    : 0;
  const saldoRestante = cobranca
    ? Math.max(cobranca.valor_usd - cobranca.valor_credito_abatido_usd - totalPrincipalPago, 0)
    : 0;

  function formatValorRecebido(moeda: MoedaTipo, valor: number): string {
    return moeda === "VES" ? `Bs. ${vesNumberFormatter.format(valor)}` : currencyFormatter.format(valor);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("back")}
          nativeButton={false}
          render={<Link href="/liquidacoes" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{tDetail("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {pagamentoRow.unidade ? (
              <Link href={`/unidades/${pagamentoRow.unidade.id}`} className="underline-offset-2 hover:underline">
                {pagamentoRow.unidade.identificacao}
              </Link>
            ) : (
              "—"
            )}
            {" · "}
            {dateTimeFormatter.format(new Date(pagamentoRow.data_pagamento))}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tDetail("paymentCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{tDetail("date")}</dt>
              <dd className="font-medium">{dateTimeFormatter.format(new Date(pagamentoRow.data_pagamento))}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tDetail("amountReceived")}</dt>
              <dd className="font-medium">
                {formatValorRecebido(pagamentoRow.moeda, pagamentoRow.valor_recebido)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tDetail("equivalentUsd")}</dt>
              <dd className="font-medium">{currencyFormatter.format(pagamentoRow.valor_equivalente_usd)}</dd>
            </div>
            {cotacaoDoPagamento != null && (
              <div>
                <dt className="text-xs text-muted-foreground">
                  {pagamentoRow.moeda === "VES" ? tDetail("rateApplied") : tDetail("rateOfTheDay")}
                </dt>
                <dd className="font-medium">{tDetail("rateValue", { rate: cotacaoDoPagamento })}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{tDetail("paymentMethodLabel")}</dt>
              <dd className="font-medium">{formaPagamentoLabel[pagamentoRow.forma_pagamento]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tDetail("unit")}</dt>
              <dd className="font-medium">
                {pagamentoRow.unidade ? (
                  <Link
                    href={`/unidades/${pagamentoRow.unidade.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {pagamentoRow.unidade.identificacao}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {pagamentoRow.unidade?.proprietario && (
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("owner")}</dt>
                <dd className="font-medium">{pagamentoRow.unidade.proprietario.nome}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{tDetail("bankReference")}</dt>
              <dd className="font-medium">{pagamentoRow.referencia_bancaria ?? "—"}</dd>
            </div>
            {pagamentoRow.observacao && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted-foreground">{tDetail("observation")}</dt>
                <dd className="font-medium">{pagamentoRow.observacao}</dd>
              </div>
            )}
            {pagamentoRow.comprovante_url && (
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("proof")}</dt>
                <dd className="font-medium">
                  <a
                    href={pagamentoRow.comprovante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    {tDetail("viewProof")}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tDetail("chargeCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!cobranca ? (
            <p className="text-sm text-muted-foreground">{tDetail("noCharge")}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs text-muted-foreground">{tDetail("type")}</dt>
                <dd className="font-medium">
                  {cobranca.descricao} <Badge variant="outline">{cobrancaTipoLabel[cobranca.tipo]}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("competencia")}</dt>
                <dd className="font-medium">{formatDate(cobranca.competencia)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("dueDate")}</dt>
                <dd className="font-medium">{formatDate(cobranca.data_vencimento)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("originalValue")}</dt>
                <dd className="font-medium">
                  {currencyFormatter.format(cobranca.valor_usd)}
                  {cobranca.valor_credito_abatido_usd > 0 && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {tDetail("creditAppliedAtIssuance")}: -
                      {currencyFormatter.format(cobranca.valor_credito_abatido_usd)}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("status")}</dt>
                <dd>
                  <Badge variant={cobrancaStatusVariant[cobranca.status]}>
                    {cobrancaStatusLabel[cobranca.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("totalPaidSoFar")}</dt>
                <dd className="font-medium">
                  {currencyFormatter.format(totalPrincipalPago + totalJurosPago)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("balanceLabel")}</dt>
                <dd className="font-medium">{currencyFormatter.format(saldoRestante)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {cobranca && (
        <Card>
          <CardHeader>
            <CardTitle>{tDetail("allocationCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("principalPaid")}</dt>
                <dd className="font-medium">
                  {currencyFormatter.format(pagamentoCobranca?.valor_principal_abatido_usd ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tDetail("penaltyInterest")}</dt>
                <dd className="font-medium">
                  {currencyFormatter.format(pagamentoCobranca?.valor_juros_pago_usd ?? 0)}
                  {(pagamentoCobranca?.valor_juros_pago_usd ?? 0) > 0 && diasAtrasoNoPagamento > 0 && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {tDetail("daysOverdueAtPayment", { count: diasAtrasoNoPagamento })}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {creditoGeradoUsd > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tDetail("creditCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm">
              {tDetail("creditGenerated", { value: currencyFormatter.format(creditoGeradoUsd) })}
            </p>
            {pagamentoRow.unidade && (
              <Link
                href={`/unidades/${pagamentoRow.unidade.id}`}
                className="w-fit text-sm underline-offset-2 hover:underline"
              >
                {tDetail("viewCreditStatement")}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {outrosPagamentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tDetail("siblingsCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:hidden">
              {outrosPagamentos.map((pagamento) => (
                <div key={pagamento.id} className="rounded-lg border border-input p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {dateTimeFormatter.format(new Date(pagamento.data_pagamento))}
                    </span>
                    <Link
                      href={`/liquidacoes/${pagamento.id}`}
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      {tDetail("viewDetails")}
                    </Link>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{tDetail("amountReceived")}</dt>
                      <dd>{formatValorRecebido(pagamento.moeda, pagamento.valor_recebido)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{tDetail("equivalentUsd")}</dt>
                      <dd>{currencyFormatter.format(pagamento.valor_equivalente_usd)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <Table className="hidden sm:table">
              <TableHeader>
                <TableRow>
                  <TableHead>{tDetail("date")}</TableHead>
                  <TableHead>{tDetail("amountReceived")}</TableHead>
                  <TableHead>{tDetail("equivalentUsd")}</TableHead>
                  <TableHead>{tDetail("principalPaid")}</TableHead>
                  <TableHead>{tDetail("penaltyInterest")}</TableHead>
                  <TableHead>{tLiquidacoes("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outrosPagamentos.map((pagamento) => (
                  <TableRow key={pagamento.id}>
                    <TableCell>{dateTimeFormatter.format(new Date(pagamento.data_pagamento))}</TableCell>
                    <TableCell>{formatValorRecebido(pagamento.moeda, pagamento.valor_recebido)}</TableCell>
                    <TableCell>{currencyFormatter.format(pagamento.valor_equivalente_usd)}</TableCell>
                    <TableCell>{currencyFormatter.format(pagamento.valor_principal_abatido_usd)}</TableCell>
                    <TableCell>{currencyFormatter.format(pagamento.valor_juros_pago_usd)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/liquidacoes/${pagamento.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {tDetail("viewDetails")}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
