import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";
import { createClient } from "@/lib/supabase/server";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
import type {
  CobrancaDaLiquidacao,
  CreditoGeradoPeloPagamento,
  LiquidacaoDetalhe,
  PagamentoIrmao,
} from "@/lib/types/pagamentos";
import type { MoedaTipo } from "@/lib/types/creditos";
import { dataCaixaCaracas } from "@/lib/arrecadacao";
import { calcularDiasAtrasoNaData } from "@/lib/encargos";
import { abonoDaCompetencia } from "@/lib/listagem-liquidacoes";
import { formatMoeda, formatTasa, formatUsd, SOBRA_MINIMA_USD } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { FUSO_CARACAS } from "@/lib/fuso";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  pagamento: Omit<PagamentoIrmao, "valor_principal_abatido_usd" | "valor_juros_pago_usd"> | null;
};

const statusVariant: Record<CobrancaStatus, "default" | "outline" | "destructive"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
};

// destino do dinheiro, na ordem em que liquidar_cobranca o aplica: encargos, principal, sobra
type ParteDestino = { chave: "principal" | "encargos" | "credito" | "absorvido"; valor: number; cor: string };

// Tela de um pagamento, na mesma lógica da lista: primeiro o dinheiro (quanto entrou e o que ele
// fez), depois a cobrança que ele abateu e o histórico dela; os dados de registro ficam ao lado
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
  const tForma = await getTranslations("liquidacoes.paymentMethod");
  const tCobrancas = await getTranslations("cobrancas");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const formatDataHora = (value: string) =>
    new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short", timeZone: FUSO_CARACAS }).format(
      new Date(value),
    );
  const formatDataLonga = (value: string) => {
    const label = new Intl.DateTimeFormat(intlLocale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: FUSO_CARACAS,
    }).format(new Date(value));
    return label.charAt(0).toUpperCase() + label.slice(1);
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
  const dataPagamentoIso = dataCaixaCaracas(pagamentoRow.data_pagamento);
  const mesCaixa = dataPagamentoIso.slice(0, 7);

  const [{ data: cotacaoDoDia, error: cotacaoError }, siblingsResult] = await Promise.all([
    // só a cotação vigente no dia do pagamento (referência para pagamentos em dólar)
    garantirCotacaoBcvAtualizada().then(() =>
      supabase
        .from("cotacao_bcv")
        .select("tasa_ves")
        .lte("data_cotacao", dataPagamentoIso)
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ tasa_ves: number }>(),
    ),
    cobranca
      ? supabase
          .from("pagamento_cobrancas")
          .select(
            "valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(id, data_pagamento, moeda, valor_recebido, forma_pagamento)",
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

  // todos os pagamentos da cobrança, este incluído, do mais antigo ao mais recente
  const historico: PagamentoIrmao[] = (siblingsResult.data ?? [])
    .filter((p): p is SiblingRow & { pagamento: NonNullable<SiblingRow["pagamento"]> } => Boolean(p.pagamento))
    .map((p) => ({
      ...p.pagamento,
      valor_principal_abatido_usd: p.valor_principal_abatido_usd,
      valor_juros_pago_usd: p.valor_juros_pago_usd,
    }))
    .sort((a, b) => (a.data_pagamento < b.data_pagamento ? -1 : 1));
  const principalDestePagamento = pagamentoCobranca?.valor_principal_abatido_usd ?? 0;
  const encargosDestePagamento = pagamentoCobranca?.valor_juros_pago_usd ?? 0;
  const principalTotalPago = historico.reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0);

  // sobra que virou saldo a favor: na moeda em que entrou, e em dólar pela tasa congelada deste pagamento
  const creditoNaMoeda = pagamentoRow.creditos_movimentacoes.reduce((acc, c) => acc + c.valor, 0);
  const creditoUsd = pagamentoRow.creditos_movimentacoes.reduce(
    (acc, c) =>
      acc + (c.moeda === "VES" && pagamentoRow.tasa_bcv_aplicada ? c.valor / pagamentoRow.tasa_bcv_aplicada : c.valor),
    0,
  );
  // sobra abaixo de SOBRA_MINIMA_USD não vira crédito: fica absorvida no pagamento
  const absorvidoUsd = Math.max(
    pagamentoRow.valor_equivalente_usd - principalDestePagamento - encargosDestePagamento - creditoUsd,
    0,
  );
  const destino: ParteDestino[] = (
    [
      { chave: "principal", valor: principalDestePagamento, cor: "bg-primary" },
      { chave: "encargos", valor: encargosDestePagamento, cor: "bg-destructive" },
      { chave: "credito", valor: creditoUsd, cor: "bg-chart-2" },
      { chave: "absorvido", valor: absorvidoUsd >= 0.01 ? absorvidoUsd : 0, cor: "bg-muted-foreground/40" },
    ] satisfies ParteDestino[]
  ).filter((p) => p.valor > 0);
  const totalDestino = destino.reduce((acc, p) => acc + p.valor, 0);

  const abono = cobranca ? abonoDaCompetencia(cobranca.competencia, mesCaixa) : null;
  const mesCompetencia = cobranca
    ? new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit", timeZone: "UTC" })
        .format(new Date(`${cobranca.competencia.slice(0, 7)}-01T00:00:00Z`))
        .replace(".", "")
    : "";
  const diasAtrasoNoPagamento = cobranca
    ? calcularDiasAtrasoNaData(cobranca.data_vencimento, cobranca.dias_graca, dataPagamentoIso)
    : 0;

  // progresso da cobrança em dólares: saldo a favor na emissão + outros pagamentos + este + o que falta
  const progresso = cobranca
    ? (() => {
        const total = cobranca.valor_usd;
        const credito = cobranca.valor_credito_abatido_usd;
        const outros = Math.max(principalTotalPago - principalDestePagamento, 0);
        const falta = Math.max(total - credito - principalTotalPago, 0);
        const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
        return { total, credito, outros, falta, pct };
      })()
    : null;

  const mesLabel = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mesCaixa}-01T00:00:00Z`),
  );
  const unidade = pagamentoRow.unidade;
  const moeda: MoedaTipo = pagamentoRow.moeda;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="mt-0.5"
          aria-label={tDetail("backToList", { month: mesLabel })}
          title={tDetail("backToList", { month: mesLabel })}
          nativeButton={false}
          render={<Link href={`/liquidacoes?mes=${mesCaixa}`} />}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-medium">
            {unidade ? (
              tDetail.rich("title", {
                unit: unidade.identificacao,
                link: (chunks) => (
                  <Link href={`/unidades/${unidade.id}`} className="underline-offset-2 hover:underline">
                    {chunks}
                  </Link>
                ),
              })
            ) : (
              tDetail("titleNoUnit")
            )}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDataLonga(pagamentoRow.data_pagamento)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {/* o dinheiro: quanto entrou e o que ele fez */}
          <Card>
            <CardHeader>
              <CardDescription>{tDetail("received")}</CardDescription>
              <CardTitle className="text-3xl tracking-tight tabular-nums">
                {formatMoeda(pagamentoRow.valor_recebido, moeda)}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <Badge variant="outline">{tForma(pagamentoRow.forma_pagamento)}</Badge>
                {pagamentoRow.referencia_bancaria && (
                  <span className="font-mono text-xs">
                    {tLiquidacoes("row.reference", { value: pagamentoRow.referencia_bancaria })}
                  </span>
                )}
                {moeda === "VES" && pagamentoRow.tasa_bcv_aplicada ? (
                  <span className="tabular-nums">
                    {tDetail("conversion", {
                      rate: formatTasa(pagamentoRow.tasa_bcv_aplicada),
                      value: formatUsd(pagamentoRow.valor_equivalente_usd),
                    })}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium">{tDetail("destination.title")}</p>
                <p className="text-xs text-muted-foreground">{tDetail("destination.hint")}</p>
              </div>
              {totalDestino > 0 && (
                <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  {destino.map((parte) => (
                    <div
                      key={parte.chave}
                      className={cn("h-full first:rounded-l-full last:rounded-r-full", parte.cor)}
                      style={{ width: `${(parte.valor / totalDestino) * 100}%` }}
                    />
                  ))}
                </div>
              )}
              <ul className="flex flex-col divide-y rounded-lg border">
                {destino.map((parte) => (
                  <li key={parte.chave} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-start gap-2">
                      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", parte.cor)} />
                      <span className="min-w-0">
                        {tDetail(`destination.parts.${parte.chave}`, { min: formatUsd(SOBRA_MINIMA_USD) })}
                        {parte.chave === "encargos" && diasAtrasoNoPagamento > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {tDetail("lateBy", { count: diasAtrasoNoPagamento })}
                          </span>
                        )}
                        {parte.chave === "credito" && unidade && (
                          <Link
                            href={`/unidades/${unidade.id}`}
                            className="block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {tDetail("viewCredit")}
                          </Link>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end tabular-nums">
                      <span className="font-medium">{formatUsd(parte.valor)}</span>
                      {parte.chave === "credito" && moeda === "VES" && (
                        <span className="text-xs text-muted-foreground">{formatMoeda(creditoNaMoeda, moeda)}</span>
                      )}
                    </span>
                  </li>
                ))}
                {destino.length === 0 && (
                  <li className="px-3 py-2.5 text-sm text-muted-foreground">{tDetail("noCharge")}</li>
                )}
              </ul>
            </CardContent>
          </Card>

          {/* a cobrança abatida: onde ela está agora e todos os pagamentos que recebeu */}
          {cobranca && progresso && (
            <Card>
              <CardHeader>
                <CardDescription>{tDetail("charge.title")}</CardDescription>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {cobranca.descricao}
                  <Badge variant="outline">{tCobrancas(`tipo.${cobranca.tipo}`)}</Badge>
                  <Badge variant={statusVariant[cobranca.status]}>{tCobrancas(`status.${cobranca.status}`)}</Badge>
                </CardTitle>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {abono === "atrasado" || abono === "adiantado" ? (
                    <Badge variant={abono === "atrasado" ? "destructive" : "outline"}>
                      {tLiquidacoes(`row.${abono}`, { month: mesCompetencia })}
                    </Badge>
                  ) : null}
                  <span>
                    {tDetail("charge.due", { date: formatDate(cobranca.data_vencimento) })}
                    {cobranca.dias_graca > 0 && ` · ${tDetail("charge.grace", { count: cobranca.dias_graca })}`}
                  </span>
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {tDetail("charge.ofTotal", { value: formatUsd(progresso.total) })}
                    </span>
                    <span className={cn("font-medium tabular-nums", progresso.falta === 0 && "text-primary")}>
                      {progresso.falta === 0
                        ? tDetail("charge.paidOff")
                        : tDetail("charge.remaining", { value: formatUsd(progresso.falta) })}
                    </span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full bg-chart-2" style={{ width: `${progresso.pct(progresso.credito)}%` }} />
                    <div className="h-full bg-primary/40" style={{ width: `${progresso.pct(progresso.outros)}%` }} />
                    <div className="h-full bg-primary" style={{ width: `${progresso.pct(principalDestePagamento)}%` }} />
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {progresso.credito > 0 && (
                      <LegendaItem cor="bg-chart-2" rotulo={tDetail("charge.creditAtIssuance")} valor={formatUsd(progresso.credito)} />
                    )}
                    {progresso.outros > 0 && (
                      <LegendaItem cor="bg-primary/40" rotulo={tDetail("charge.otherPayments")} valor={formatUsd(progresso.outros)} />
                    )}
                    <LegendaItem cor="bg-primary" rotulo={tDetail("charge.thisPayment")} valor={formatUsd(principalDestePagamento)} />
                    {progresso.falta > 0 && (
                      <LegendaItem cor="bg-muted" rotulo={tDetail("charge.missing")} valor={formatUsd(progresso.falta)} />
                    )}
                  </ul>
                </div>

                {historico.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{tDetail("history.title", { count: historico.length })}</p>
                    <ol className="flex flex-col divide-y rounded-lg border">
                      {historico.map((p) => {
                        const atual = p.id === pagamentoRow.id;
                        const conteudo = (
                          <>
                            <span className="flex min-w-0 flex-col">
                              <span className={cn("text-sm", atual && "font-medium")}>
                                {formatDataHora(p.data_pagamento)}
                              </span>
                              <span className="text-xs text-muted-foreground">{tForma(p.forma_pagamento)}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {atual && <Badge variant="secondary">{tDetail("history.current")}</Badge>}
                              <span className="flex flex-col items-end tabular-nums">
                                <span className="text-sm font-medium">{formatMoeda(p.valor_recebido, p.moeda)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {tLiquidacoes("row.settled", {
                                    value: formatUsd(p.valor_principal_abatido_usd + p.valor_juros_pago_usd),
                                  })}
                                </span>
                              </span>
                            </span>
                          </>
                        );
                        return (
                          <li key={p.id}>
                            {atual ? (
                              <div aria-current="page" className="flex items-center justify-between gap-3 bg-muted/50 px-3 py-2.5">
                                {conteudo}
                              </div>
                            ) : (
                              <Link
                                href={`/liquidacoes/${p.id}`}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                              >
                                {conteudo}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* dados de registro: consulta, não decisão */}
        <aside className="min-w-0">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{tDetail("details.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-sm">
                <Dado rotulo={tDetail("details.unit")}>
                  {unidade ? (
                    <Link href={`/unidades/${unidade.id}`} className="font-medium underline-offset-2 hover:underline">
                      {unidade.identificacao}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {unidade?.proprietario && (
                    <span className="block text-muted-foreground">{unidade.proprietario.nome}</span>
                  )}
                </Dado>
                <Dado rotulo={tDetail("details.date")}>{formatDataHora(pagamentoRow.data_pagamento)}</Dado>
                <Dado rotulo={tDetail("details.method")}>{tForma(pagamentoRow.forma_pagamento)}</Dado>
                <Dado rotulo={tDetail("details.reference")}>
                  <span className="font-mono">{pagamentoRow.referencia_bancaria ?? "—"}</span>
                </Dado>
                {moeda === "VES" ? (
                  pagamentoRow.tasa_bcv_aplicada ? (
                    <Dado rotulo={tDetail("details.rateApplied")}>{formatTasa(pagamentoRow.tasa_bcv_aplicada)}</Dado>
                  ) : null
                ) : cotacaoDoDia ? (
                  <Dado rotulo={tDetail("details.rateOfTheDay")}>{formatTasa(cotacaoDoDia.tasa_ves)}</Dado>
                ) : null}
                {cobranca && (
                  <Dado rotulo={tDetail("details.competencia")}>{formatDate(cobranca.competencia)}</Dado>
                )}
                {pagamentoRow.observacao && (
                  <Dado rotulo={tDetail("details.observation")}>
                    <span className="whitespace-pre-line">{pagamentoRow.observacao}</span>
                  </Dado>
                )}
              </dl>
              {pagamentoRow.comprovante_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  nativeButton={false}
                  render={<a href={pagamentoRow.comprovante_url} target="_blank" rel="noopener noreferrer" />}
                >
                  {tDetail("details.viewProof")}
                  <ExternalLinkIcon />
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function LegendaItem({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", cor, cor === "bg-muted" && "ring-1 ring-border")} />
      {rotulo}
      <span className="font-medium text-foreground tabular-nums">{valor}</span>
    </li>
  );
}
