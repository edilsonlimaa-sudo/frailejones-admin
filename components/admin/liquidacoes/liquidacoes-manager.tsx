import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import type { Liquidacao } from "@/lib/types/pagamentos";
import type { CobrancaTipo } from "@/lib/types/cobrancas";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import type { AnoMes } from "@/lib/mes";
import { NavegadorMes } from "@/components/admin/navegador-mes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoeda, formatUsd } from "@/lib/moeda";

type LiquidacoesManagerProps = {
  liquidacoes: Liquidacao[];
} & AnoMes; // mês de caixa listado

export async function LiquidacoesManager({ liquidacoes, ano, mes }: LiquidacoesManagerProps) {
  const t = await getTranslations("liquidacoes");
  const tCommon = await getTranslations("common");
  const tCobrancas = await getTranslations("cobrancas.tipo");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" });
  const cobrancaTipoLabel: Record<CobrancaTipo, string> = {
    ordinaria: tCobrancas("ordinaria"),
    extraordinaria: tCobrancas("extraordinaria"),
  };
  const formaPagamentoLabel: Record<FormaPagamentoTipo, string> = {
    pago_movil: t("paymentMethod.pago_movil"),
    transferencia: t("paymentMethod.transferencia"),
    efectivo_usd: t("paymentMethod.efectivo_usd"),
    zelle: t("paymentMethod.zelle"),
  };
  // valor_recebido já vem na moeda original do pagamento (não precisa converter)
  function formatValorRecebido(liquidacao: Liquidacao): string {
    return formatMoeda(liquidacao.valor_recebido, liquidacao.moeda);
  }
  const totalArrecadadoUsd = liquidacoes.reduce((acc, l) => acc + l.valor_equivalente_usd, 0);
  const mesLabel = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ano, mes - 1, 1)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("filteredByMonth", { month: mesLabel })}.{" "}
          {t("summary", { count: liquidacoes.length, total: formatUsd(totalArrecadadoUsd) })}
        </CardDescription>
        <CardAction>
          <NavegadorMes ano={ano} mes={mes} basePath="/liquidacoes" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {liquidacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLiquidations")}</p>
        ) : (
          <>
            {/* mobile: lista de cards */}
            <div className="flex flex-col gap-3 sm:hidden">
              {liquidacoes.map((liquidacao) => (
                <div key={liquidacao.id} className="rounded-lg border border-input p-3">
                  <div className="flex items-center justify-between gap-2">
                    {liquidacao.unidade ? (
                      <Link
                        href={`/unidades/${liquidacao.unidade.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {liquidacao.unidade.identificacao}
                      </Link>
                    ) : (
                      <span className="font-medium">—</span>
                    )}
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">{formaPagamentoLabel[liquidacao.forma_pagamento]}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={tCommon("actions")} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/liquidacoes/${liquidacao.id}`} />}>
                            {t("viewDetails")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("date")}</dt>
                      <dd>{dateTimeFormatter.format(new Date(liquidacao.data_pagamento))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("charge")}</dt>
                      <dd>
                        {liquidacao.cobranca
                          ? `${liquidacao.cobranca.descricao} (${cobrancaTipoLabel[liquidacao.cobranca.tipo]})`
                          : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">{t("amountReceived")}</dt>
                      <dd className="font-medium">
                        {formatValorRecebido(liquidacao)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatUsd(liquidacao.valor_equivalente_usd)}
                        </span>
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
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead>{t("charge")}</TableHead>
                  <TableHead>{t("amountReceived")}</TableHead>
                  <TableHead>{t("equivalentUsd")}</TableHead>
                  <TableHead>{t("paymentMethodLabel")}</TableHead>
                  <TableHead>{t("reference")}</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidacoes.map((liquidacao) => (
                  <TableRow key={liquidacao.id}>
                    <TableCell>{dateTimeFormatter.format(new Date(liquidacao.data_pagamento))}</TableCell>
                    <TableCell>
                      {liquidacao.unidade ? (
                        <Link
                          href={`/unidades/${liquidacao.unidade.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {liquidacao.unidade.identificacao}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {liquidacao.cobranca
                        ? `${liquidacao.cobranca.descricao} (${cobrancaTipoLabel[liquidacao.cobranca.tipo]})`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatValorRecebido(liquidacao)}</TableCell>
                    <TableCell className="font-medium">
                      {formatUsd(liquidacao.valor_equivalente_usd)}
                    </TableCell>
                    <TableCell>{formaPagamentoLabel[liquidacao.forma_pagamento]}</TableCell>
                    <TableCell>{liquidacao.referencia_bancaria ?? "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={tCommon("actions")} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/liquidacoes/${liquidacao.id}`} />}>
                            {t("viewDetails")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
