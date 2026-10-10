import { getTranslations } from "next-intl/server";

import type { QuitacaoDoMes as Quitacao } from "@/lib/arrecadacao";
import { formatUsd } from "@/lib/moeda";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// dívida quitada pelos pagamentos recebidos no mês, em dólares (a moeda das cobranças)
export async function QuitacaoDoMes({ quitacao }: { quitacao: Quitacao }) {
  const t = await getTranslations("dashboard.settlement");

  const linhas = [
    { chave: "doMes", valor: quitacao.principalDoMes, cor: "var(--primary)" },
    { chave: "atrasado", valor: quitacao.principalAtrasado, cor: "var(--chart-3)" },
    { chave: "adiantado", valor: quitacao.principalAdiantado, cor: "var(--chart-4)" },
    { chave: "encargos", valor: quitacao.encargos, cor: "var(--destructive)" },
    // "adiantado" é raro (pagar cobrança de competência futura): só aparece quando existe
  ].filter((l) => l.chave !== "adiantado" || l.valor > 0);
  // só pra largura da barra (composição do total); não é exibido como número porque, ao lado da
  // arrecadação, "100%" era lido como "100% das cobranças do mês quitadas"
  const percentual = (valor: number) => (quitacao.total > 0 ? (valor / quitacao.total) * 100 : 0);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {quitacao.total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {linhas.map((l) => (
                <div
                  key={l.chave}
                  className="h-full"
                  style={{ width: `${percentual(l.valor)}%`, backgroundColor: l.cor }}
                />
              ))}
            </div>
            <ul className="flex flex-col gap-2.5">
              {linhas.map((l) => (
                <li key={l.chave} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: l.cor }} />
                  <span className="flex-1 text-muted-foreground">{t(`rows.${l.chave}`)}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{formatUsd(l.valor)}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 border-t pt-2.5 text-sm">
                <span className="flex-1 font-medium">{t("total")}</span>
                <span className="w-24 text-right font-medium tabular-nums">
                  {formatUsd(quitacao.total)}
                </span>
              </li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
