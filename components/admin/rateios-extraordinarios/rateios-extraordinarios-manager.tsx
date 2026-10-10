"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RateioExtraordinarioFormDialog } from "@/components/admin/rateios-extraordinarios/rateio-extraordinario-form-dialog";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import { diferencaArredondamento, formatDiferenca } from "@/lib/rateios";

type RateiosExtraordinariosManagerProps = {
  despesas: DespesaExtraordinaria[];
  unidades: Unidade[];
};

export function RateiosExtraordinariosManager({
  despesas,
  unidades,
}: RateiosExtraordinariosManagerProps) {
  const t = useTranslations("rateiosExtraordinarios");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const [despesasList, setDespesasList] = useState(despesas);

  // só cadastro: rateio emite as cobranças ao ser salvo e não é editável nem excluível depois
  const [formOpen, setFormOpen] = useState(false);

  const sortDespesas = (list: DespesaExtraordinaria[]) =>
    [...list].sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento));

  const openCreateDialog = () => setFormOpen(true);

  const handleSaved = (despesa: DespesaExtraordinaria) => {
    setDespesasList((prev) => sortDespesas([...prev, despesa]));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
          <CardAction>
            <Button onClick={openCreateDialog}>
              <PlusIcon />
              {t("newRateio")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {despesasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRateios")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("titleColumn")}</TableHead>
                  <TableHead>{t("totalValue")}</TableHead>
                  <TableHead>{t("valuePerUnit")}</TableHead>
                  <TableHead>{t("units")}</TableHead>
                  <TableHead>{t("dueDate")}</TableHead>
                  <TableHead>{t("penalty")}</TableHead>
                  <TableHead>{t("dailyInterest")}</TableHead>
                  <TableHead>{t("gracePeriod")}</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {despesasList.map((despesa) => {
                  const diferenca = diferencaArredondamento(
                    despesa.valor_total_usd,
                    despesa.valor_por_unidade_usd,
                    despesa.unidade_ids.length,
                  );
                  return (
                  <TableRow key={despesa.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/rateios-extraordinarios/${despesa.id}`}
                        className="hover:underline"
                      >
                        {despesa.titulo}
                      </Link>
                    </TableCell>
                    <TableCell>{formatUsd(despesa.valor_total_usd)}</TableCell>
                    <TableCell>
                      {formatUsd(despesa.valor_por_unidade_usd)}
                      {diferenca !== 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {t("roundingShort", { diff: formatDiferenca(diferenca) })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{despesa.unidade_ids.length}</Badge>
                    </TableCell>
                    <TableCell>
                      {dateFormatter.format(new Date(`${despesa.data_vencimento}T00:00:00Z`))}
                    </TableCell>
                    <TableCell>{despesa.pct_multa_atraso}%</TableCell>
                    <TableCell>{despesa.pct_juros_diario}%</TableCell>
                    <TableCell>{t("graceDays", { count: despesa.dias_graca })}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label={tCommon("actions")} />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/rateios-extraordinarios/${despesa.id}`} />}>
                            {t("viewProgress")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {/* visíveis mas desabilitados, com o motivo: o rateio emite as cobranças no
                              cadastro, então editar ou excluir divergiria das cobranças (algumas já pagas).
                              Item desabilitado não recebe hover, por isso o motivo é texto, não tooltip */}
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="max-w-60 whitespace-normal">
                              {t("lockedActionsReason")}
                            </DropdownMenuLabel>
                            <DropdownMenuItem disabled>{tCommon("edit")}</DropdownMenuItem>
                            <DropdownMenuItem disabled variant="destructive">
                              {tCommon("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RateioExtraordinarioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        unidades={unidades}
        onSaved={handleSaved}
      />
    </>
  );
}
