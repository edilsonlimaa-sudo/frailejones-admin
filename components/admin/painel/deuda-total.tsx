import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { formatUsd, formatVes } from "@/lib/moeda";
import { resumirDivida, type CobrancaPendenteTotal } from "@/lib/painel/divida";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type { CobrancaPendenteTotal };

type DeudaTotalProps = {
  cobrancas: CobrancaPendenteTotal[];
  hojeIso: string;
  tasaVes: number | null;
};

// quantas unidades aparecem na lista das maiores dívidas
const MAIORES_DIVIDAS = 5;

// tudo que está pendente hoje, de qualquer competência. O resto do Dashboard é filtrado pelo mês
// selecionado, então sem isto o mês corrente mostraria "0 pendentes" mesmo com meses anteriores
// em atraso. Encargos calculados hoje, com a mesma regra das demais telas (lib/encargos).
export async function DeudaTotal({ cobrancas, hojeIso, tasaVes }: DeudaTotalProps) {
  const t = await getTranslations("dashboard");

  const { principal, encargos, total, vencidas, pendentes, unidades } = resumirDivida(cobrancas, hojeIso);
  const maiores = unidades.slice(0, MAIORES_DIVIDAS);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">{t("debt.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("debt.description")}</p>
      </div>

      {unidades.length === 0 ? (
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("debt.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t("debt.total")}</CardDescription>
              <CardTitle className="text-2xl text-destructive">{formatUsd(total)}</CardTitle>
              {tasaVes && <p className="text-xs text-muted-foreground">{formatVes(total, tasaVes)}</p>}
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("debt.principal")}</span>
                <span className="font-medium tabular-nums">{formatUsd(principal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("debt.charges")}</span>
                <span className="font-medium tabular-nums">{formatUsd(encargos)}</span>
              </div>
              <p className="border-t pt-2.5 text-xs text-muted-foreground">
                {t("debt.summary", { overdue: vencidas, pending: pendentes, units: unidades.length })}
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("debt.topTitle")}</CardTitle>
              <CardDescription>{t("debt.topDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {maiores.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      {u.id ? (
                        <Link href={`/unidades/${u.id}`} className="font-medium hover:underline">
                          {u.identificacao ?? t("unitRemoved")}
                        </Link>
                      ) : (
                        <span className="font-medium">{u.identificacao ?? t("unitRemoved")}</span>
                      )}
                      <p className="truncate text-xs text-muted-foreground">
                        {u.proprietario ? `${u.proprietario} · ` : ""}
                        {t("chargesCount", { count: u.cobrancas })}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{formatUsd(u.total)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
