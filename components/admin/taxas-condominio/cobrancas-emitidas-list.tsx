"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import type { UnidadeCobrancaDoMes } from "@/lib/types/cobrancas";
import type { Encargos } from "@/lib/encargos";
import { formatVes, type CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmitirCobrancasDoMesButton } from "@/components/admin/taxas-condominio/emitir-cobrancas-do-mes-button";

type LinhaEmitida = {
  unidadeId: string;
  unidadeIdentificacao: string;
  unidadeProprietarioNome: string | null;
  cobranca: NonNullable<UnidadeCobrancaDoMes["cobranca"]>;
  encargos: Encargos;
  multaJuros: number;
  totalAtualizado: number;
  tasaVesExibir: number | null;
};

type CobrancasEmitidasListProps = {
  linhas: LinhaEmitida[];
  naoEmitidas: { id: string; identificacao: string }[];
  taxaId: string;
  competencia: string;
  dataVencimento: string;
  valorUsd: number;
  pctMultaAtraso: number;
  pctJurosDiario: number;
  diasGraca: number;
};

export function CobrancasEmitidasList({
  linhas,
  naoEmitidas,
  taxaId,
  competencia,
  dataVencimento,
  valorUsd,
  pctMultaAtraso,
  pctJurosDiario,
  diasGraca,
}: CobrancasEmitidasListProps) {
  const t = useTranslations("taxaCondominioDetail");
  const tCobrancas = useTranslations("cobrancas.status");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const currencyFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const statusLabel = { pendente: tCobrancas("pendente"), pago: tCobrancas("pago"), cancelado: tCobrancas("cancelado") } as const;
  const statusVariant = {
    pendente: "outline",
    pago: "default",
    cancelado: "destructive",
  } as const;

  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const linhasFiltradas = normalizedSearch
    ? linhas.filter(
        (linha) =>
          linha.unidadeIdentificacao.toLocaleLowerCase().includes(normalizedSearch) ||
          (linha.unidadeProprietarioNome?.toLocaleLowerCase().includes(normalizedSearch) ?? false),
      )
    : linhas;

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        placeholder={t("searchPlaceholder")}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        aria-label={t("searchPlaceholder")}
      />

      {linhasFiltradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSearchResults")}</p>
      ) : (
        <>
          {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
          <div className="flex flex-col gap-3 sm:hidden">
            {linhasFiltradas.map(({ unidadeId, unidadeIdentificacao, unidadeProprietarioNome, cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => {
              const totalAbatido =
                cobranca.valor_credito_abatido_usd +
                cobranca.valor_principal_pago_usd +
                cobranca.valor_juros_pago_usd;

              return (
                <div key={cobranca.id} className="rounded-lg border border-input p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Link
                        href={`/unidades/${unidadeId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {unidadeIdentificacao}
                      </Link>
                      {unidadeProprietarioNome && (
                        <span className="block text-xs text-muted-foreground">
                          {unidadeProprietarioNome}
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
              {linhasFiltradas.map(({ unidadeId, unidadeIdentificacao, unidadeProprietarioNome, cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => {
                const totalAbatido =
                  cobranca.valor_credito_abatido_usd +
                  cobranca.valor_principal_pago_usd +
                  cobranca.valor_juros_pago_usd;

                return (
                  <TableRow key={cobranca.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/unidades/${unidadeId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {unidadeIdentificacao}
                      </Link>
                    </TableCell>
                    <TableCell>{unidadeProprietarioNome ?? "—"}</TableCell>
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
        </>
      )}

      {naoEmitidas.length > 0 && (
        <EmitirCobrancasDoMesButton
          taxaId={taxaId}
          competencia={competencia}
          dataVencimento={dataVencimento}
          valorUsd={valorUsd}
          pctMultaAtraso={pctMultaAtraso}
          pctJurosDiario={pctJurosDiario}
          diasGraca={diasGraca}
          unidades={naoEmitidas}
        />
      )}
    </div>
  );
}
