import { useLocale, useTranslations } from "next-intl";

import type { CreditoMovimentacao, MovimentacaoTipo } from "@/lib/types/creditos";
import { formatUsd } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { FUSO_CARACAS } from "@/lib/fuso";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// saldo a favor da unidade: carteira única em dólar (migration saldo_a_favor_em_dolar)
export function saldoDosCreditos(creditos: CreditoMovimentacao[]): number {
  const saldo = creditos.reduce((acc, c) => acc + (c.tipo === "ENTRADA" ? c.valor : -c.valor), 0);
  return Number(saldo.toFixed(2));
}

const VARIANTE_TIPO: Record<MovimentacaoTipo, "default" | "secondary"> = {
  ENTRADA: "default",
  SAIDA: "secondary",
};

// extrato do saldo a favor (admin e portal): saldo atual em cima e as movimentações, da mais
// recente pra mais antiga, com o saldo acumulado depois de cada uma
export function ExtratoCreditos({ creditos }: { creditos: CreditoMovimentacao[] }) {
  const t = useTranslations("unidadeDetail");
  const tCobrancas = useTranslations("cobrancas");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FUSO_CARACAS,
  });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

  // creditos vem do mais recente pro mais antigo: acumula de trás pra frente
  const saldoAposCada = new Map<string, number>();
  let acumulado = 0;
  [...creditos].reverse().forEach((credito) => {
    acumulado += credito.tipo === "ENTRADA" ? credito.valor : -credito.valor;
    saldoAposCada.set(credito.id, Number(acumulado.toFixed(2)));
  });

  const linhas = creditos.map((credito) => ({
    credito,
    saldoAcumulado: saldoAposCada.get(credito.id)!,
    cobrancaRelacionada: credito.tipo === "SAIDA" ? credito.cobranca : (credito.pagamento?.cobranca ?? null),
    dataPagamento: credito.tipo === "ENTRADA" ? (credito.pagamento?.data_pagamento ?? null) : null,
  }));

  const origem = ({ cobrancaRelacionada, dataPagamento, credito }: (typeof linhas)[number]) =>
    cobrancaRelacionada ? (
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
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-input bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">{t("credits.balance")}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{formatUsd(saldoDosCreditos(creditos))}</p>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("credits.empty")}</p>
      ) : (
        <>
          {/* mobile: lista de cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {linhas.map((linha) => (
              <div key={linha.credito.id} className="rounded-lg border border-input p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{dateTimeFormatter.format(new Date(linha.credito.created_at))}</span>
                  <Badge variant={VARIANTE_TIPO[linha.credito.tipo]}>
                    {tCobrancas(`creditType.${linha.credito.tipo}`)}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("credits.value")}</dt>
                    <dd>{formatUsd(linha.credito.valor)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {linha.credito.tipo === "ENTRADA" ? t("credits.origin") : t("credits.appliedTo")}
                    </dt>
                    <dd>{origem(linha)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">{t("credits.runningBalance")}</dt>
                    <dd className="font-medium">{formatUsd(linha.saldoAcumulado)}</dd>
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
              {linhas.map((linha) => (
                <TableRow key={linha.credito.id}>
                  <TableCell>{dateTimeFormatter.format(new Date(linha.credito.created_at))}</TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_TIPO[linha.credito.tipo]}>
                      {tCobrancas(`creditType.${linha.credito.tipo}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatUsd(linha.credito.valor)}</TableCell>
                  <TableCell>{origem(linha)}</TableCell>
                  <TableCell className="font-medium">{formatUsd(linha.saldoAcumulado)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
