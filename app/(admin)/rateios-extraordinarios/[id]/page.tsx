import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { CobrancaDoRateio, CobrancaStatus } from "@/lib/types/cobrancas";
import { calcularEncargos } from "@/lib/encargos";
import { encontrarTasaNaData, formatVes } from "@/lib/moeda";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CobrancaRow = Omit<
  CobrancaDoRateio,
  "valor_principal_pago_usd" | "valor_juros_pago_usd" | "data_ultimo_pagamento"
> & {
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento: { data_pagamento: string } | null;
  }[];
};

export default async function RateioExtraordinarioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("common");
  const tRateio = await getTranslations("rateioExtraordinarioDetail");
  const tCobrancas = await getTranslations("cobrancas.status");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const currencyFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const statusLabel: Record<CobrancaStatus, string> = {
    pendente: tCobrancas("pendente"),
    pago: tCobrancas("pago"),
    cancelado: tCobrancas("cancelado"),
  };
  const statusVariant: Record<CobrancaStatus, "default" | "outline" | "destructive"> = {
    pendente: "outline",
    pago: "default",
    cancelado: "destructive",
  };

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
  ] = await Promise.all([
    supabase
      .from("cobrancas")
      .select(
        "id, descricao, competencia, valor_usd, valor_credito_abatido_usd, data_emissao, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento))",
      )
      .eq("despesa_extraordinaria_id", id)
      .order("data_vencimento", { ascending: true })
      .returns<CobrancaRow[]>(),
    supabase
      .from("cotacao_bcv")
      .select("data_cotacao, tasa_ves")
      .order("data_cotacao", { ascending: false })
      .limit(366)
      .returns<{ data_cotacao: string; tasa_ves: number }[]>(),
  ]);

  if (cobrancasError || cotacaoBcvError) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", { message: cobrancasError?.message ?? cotacaoBcvError?.message ?? "" })}
      </p>
    );
  }

  const cobrancas: CobrancaDoRateio[] = (cobrancasRaw ?? []).map(
    ({ pagamento_cobrancas, ...cobranca }) => ({
      ...cobranca,
      valor_principal_pago_usd: pagamento_cobrancas.reduce(
        (acc, p) => acc + p.valor_principal_abatido_usd,
        0,
      ),
      valor_juros_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0),
      data_ultimo_pagamento: pagamento_cobrancas.reduce<string | null>(
        (latest, p) =>
          p.pagamento && (!latest || p.pagamento.data_pagamento > latest)
            ? p.pagamento.data_pagamento
            : latest,
        null,
      ),
    }),
  );

  const cobrancasAtivas = cobrancas.filter((c) => c.status !== "cancelado");
  const pagas = cobrancas.filter((c) => c.status === "pago").length;
  const pendentes = cobrancas.filter((c) => c.status === "pendente").length;
  const canceladas = cobrancas.filter((c) => c.status === "cancelado").length;

  const valorTotalEsperado = cobrancasAtivas.reduce((acc, c) => acc + c.valor_usd, 0);
  const valorTotalArrecadado = cobrancasAtivas.reduce(
    (acc, c) =>
      acc + c.valor_credito_abatido_usd + c.valor_principal_pago_usd + c.valor_juros_pago_usd,
    0,
  );
  const progresso =
    valorTotalEsperado > 0
      ? Math.min(100, (valorTotalArrecadado / valorTotalEsperado) * 100)
      : 0;

  const hojeIso = new Date().toISOString().slice(0, 10);
  const cotacaoAtual = (cotacoes ?? [])[0] ?? null;
  const linhasCobranca = cobrancas.map((cobranca) => {
    const totalAbatido =
      cobranca.valor_credito_abatido_usd + cobranca.valor_principal_pago_usd + cobranca.valor_juros_pago_usd;
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
            cotacoes ?? [],
            (cobranca.data_ultimo_pagamento ?? cobranca.data_vencimento).slice(0, 10),
          );
    return { cobranca, totalAbatido, encargos, multaJuros, totalAtualizado, tasaVesExibir };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("back")}
          nativeButton={false}
          render={<Link href="/rateios-extraordinarios" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{despesa.titulo}</h1>
          {despesa.descricao && (
            <p className="text-sm text-muted-foreground">{despesa.descricao}</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tRateio("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("totalValue")}</dt>
              <dd className="font-medium">{currencyFormatter.format(despesa.valor_total_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("valuePerUnit")}</dt>
              <dd className="font-medium">
                {currencyFormatter.format(despesa.valor_por_unidade_usd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("dueDate")}</dt>
              <dd className="font-medium">{formatDate(despesa.data_vencimento)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("units")}</dt>
              <dd className="font-medium">{cobrancas.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("penalty")}</dt>
              <dd className="font-medium">{despesa.pct_multa_atraso}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("dailyInterest")}</dt>
              <dd className="font-medium">{despesa.pct_juros_diario}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tRateio("gracePeriod")}</dt>
              <dd className="font-medium">{tRateio("graceDays", { count: despesa.dias_graca })}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tRateio("progressTitle")}</CardTitle>
          <CardDescription>
            {tRateio("paidCharges", { paid: pagas, total: cobrancas.length })}
            {canceladas > 0 && tRateio("cancelledSuffix", { count: canceladas })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress value={progresso} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{tRateio("collected")}</p>
              <p className="font-medium">{currencyFormatter.format(valorTotalArrecadado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tRateio("expected")}</p>
              <p className="font-medium">{currencyFormatter.format(valorTotalEsperado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tRateio("pending")}</p>
              <p className="font-medium">{pendentes}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tRateio("paid")}</p>
              <p className="font-medium">{pagas}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tRateio("chargesByUnitTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {cobrancas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tRateio("noCharges")}</p>
          ) : (
            <>
              {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
              <div className="flex flex-col gap-3 sm:hidden">
                {linhasCobranca.map(({ cobranca, totalAbatido, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => (
                  <div key={cobranca.id} className="rounded-lg border border-input p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{cobranca.unidade?.identificacao ?? "—"}</span>
                      <Badge variant={statusVariant[cobranca.status]}>
                        {statusLabel[cobranca.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">{tRateio("value")}</dt>
                        <dd>
                          {currencyFormatter.format(cobranca.valor_usd)}
                          {cobranca.valor_credito_abatido_usd > 0 && (
                            <span className="block text-xs text-primary">
                              {tRateio("creditApplied", { value: currencyFormatter.format(cobranca.valor_credito_abatido_usd) })}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{tRateio("paidValue")}</dt>
                        <dd>{currencyFormatter.format(totalAbatido)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{tRateio("balance")}</dt>
                        <dd>{currencyFormatter.format(encargos.saldoDevedor)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{tRateio("dueDate")}</dt>
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
                          <dt className="text-xs text-muted-foreground">{tRateio("penaltyInterest")}</dt>
                          <dd>{currencyFormatter.format(multaJuros)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs text-muted-foreground">{tRateio("updatedTotal")}</dt>
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
                ))}
              </div>

              {/* sm+: tabela */}
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tRateio("unit")}</TableHead>
                    <TableHead>{tRateio("value")}</TableHead>
                    <TableHead>{tRateio("paidValue")}</TableHead>
                    <TableHead>{tRateio("balance")}</TableHead>
                    <TableHead>{tRateio("dueDate")}</TableHead>
                    <TableHead>{tRateio("penaltyInterest")}</TableHead>
                    <TableHead>{tRateio("updatedTotal")}</TableHead>
                    <TableHead>{tRateio("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasCobranca.map(({ cobranca, totalAbatido, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => (
                    <TableRow key={cobranca.id}>
                      <TableCell className="font-medium">
                        {cobranca.unidade?.identificacao ?? "—"}
                      </TableCell>
                      <TableCell>
                        {currencyFormatter.format(cobranca.valor_usd)}
                        {cobranca.valor_credito_abatido_usd > 0 && (
                          <span className="block text-xs text-primary">
                            {tRateio("creditApplied", { value: currencyFormatter.format(cobranca.valor_credito_abatido_usd) })}
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
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
