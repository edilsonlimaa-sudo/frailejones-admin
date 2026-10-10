import { getTranslations } from "next-intl/server";

import { formatUsd } from "@/lib/moeda";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// o que aconteceu com o emitido do mês: liga a visão de competência (cobranças do mês) à de caixa
// ("Dívida quitada no mês"). Quitado dentro do mês + nos meses seguintes + em aberto = emitido.
// Multa e juros não fazem parte do emitido, então ficam fora da barra, numa linha à parte.
export type RecaudacaoDoMes = {
  emitido: number;
  quitadoNoMes: number;
  quitadoDepois: number;
  emAberto: number;
  encargos: number;
};

type RecaudacaoDoMesProps = {
  recaudacao: RecaudacaoDoMes;
  unidadesAtivas: number;
};

export async function RecaudacaoDoMes({ recaudacao, unidadesAtivas }: RecaudacaoDoMesProps) {
  const t = await getTranslations("dashboard");

  const linhas = [
    { chave: "noMes", valor: recaudacao.quitadoNoMes, cor: "var(--primary)" },
    { chave: "depois", valor: recaudacao.quitadoDepois, cor: "var(--chart-3)" },
    { chave: "emAberto", valor: recaudacao.emAberto, cor: "var(--muted)" },
  ];
  const percentual = (valor: number) =>
    recaudacao.emitido > 0 ? Math.min(100, (valor / recaudacao.emitido) * 100) : 0;
  const quitado = recaudacao.quitadoNoMes + recaudacao.quitadoDepois;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("collectionTitle")}</CardTitle>
        <CardDescription>{t("activeUnitsDescription", { count: unidadesAtivas })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recaudacao.emitido === 0 ? (
          <p className="text-sm text-muted-foreground">{t("collection.empty")}</p>
        ) : (
          <>
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {linhas
                  .filter((l) => l.chave !== "emAberto")
                  .map((l) => (
                    <div
                      key={l.chave}
                      className="h-full"
                      style={{ width: `${percentual(l.valor)}%`, backgroundColor: l.cor }}
                    />
                  ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("collectedPercent", { percent: percentual(quitado).toFixed(0) })}
              </p>
            </div>
            <ul className="flex flex-col gap-2.5">
              <li className="flex items-center gap-2 text-sm">
                <span className="flex-1 font-medium">{t("collection.issued")}</span>
                <span className="w-24 text-right font-medium tabular-nums">
                  {formatUsd(recaudacao.emitido)}
                </span>
              </li>
              {linhas.map((l) => (
                <li key={l.chave} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px] border border-border"
                    style={{ backgroundColor: l.cor }}
                  />
                  <span className="flex-1 text-muted-foreground">{t(`collection.rows.${l.chave}`)}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{formatUsd(l.valor)}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 border-t pt-2.5 text-sm">
                <span className="flex-1 text-muted-foreground">
                  {t("collection.charges")}
                  <span className="block text-xs">{t("collection.chargesNote")}</span>
                </span>
                <span className="w-24 text-right font-medium tabular-nums">
                  {formatUsd(recaudacao.encargos)}
                </span>
              </li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
