import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { calcularEncargos } from "@/lib/encargos";
import { formatUsd, formatVes } from "@/lib/moeda";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type CobrancaPendenteTotal = {
  id: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  status: CobrancaStatus;
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  pagamento_cobrancas: { valor_principal_abatido_usd: number }[];
};

type DeudaTotalProps = {
  cobrancas: CobrancaPendenteTotal[];
  hojeIso: string;
  tasaVes: number | null;
};

type DividaDaUnidade = {
  id: string;
  identificacao: string;
  proprietario: string | null;
  cobrancas: number;
  total: number;
};

// quantas unidades aparecem na lista das maiores dívidas
const MAIORES_DIVIDAS = 5;

// tudo que está pendente hoje, de qualquer competência. O resto do Dashboard é filtrado pelo mês
// selecionado, então sem isto o mês corrente mostraria "0 pendentes" mesmo com meses anteriores
// em atraso. Encargos calculados hoje, com a mesma regra das demais telas (lib/encargos).
export async function DeudaTotal({ cobrancas, hojeIso, tasaVes }: DeudaTotalProps) {
  const t = await getTranslations("dashboard");

  let principal = 0;
  let encargos = 0;
  let vencidas = 0;
  const porUnidade = new Map<string, DividaDaUnidade>();
  for (const c of cobrancas) {
    const e = calcularEncargos(
      {
        ...c,
        valor_principal_pago_usd: c.pagamento_cobrancas.reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0),
      },
      hojeIso,
    );
    if (e.saldoDevedor <= 0) continue;
    principal += e.saldoDevedor;
    encargos += e.valorMulta + e.valorJuros;
    if (e.diasAtraso > 0) vencidas += 1;

    const chave = c.unidade?.id ?? "";
    const divida = porUnidade.get(chave) ?? {
      id: chave,
      identificacao: c.unidade?.identificacao ?? t("unitRemoved"),
      proprietario: c.unidade?.proprietario?.nome ?? null,
      cobrancas: 0,
      total: 0,
    };
    divida.cobrancas += 1;
    divida.total += e.valorTotalComEncargos;
    porUnidade.set(chave, divida);
  }
  const total = principal + encargos;
  const pendentes = [...porUnidade.values()].reduce((acc, u) => acc + u.cobrancas, 0);
  const maiores = [...porUnidade.values()].sort((a, b) => b.total - a.total).slice(0, MAIORES_DIVIDAS);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">{t("debt.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("debt.description")}</p>
      </div>

      {porUnidade.size === 0 ? (
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
                {t("debt.summary", { overdue: vencidas, pending: pendentes, units: porUnidade.size })}
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
                          {u.identificacao}
                        </Link>
                      ) : (
                        <span className="font-medium">{u.identificacao}</span>
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
