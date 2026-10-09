import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { formatMes, mesAdjacente, mesAtual, type AnoMes } from "@/lib/mes";
import { Button } from "@/components/ui/button";

type NavegadorMesProps = AnoMes & {
  // rota que recebe o ?mes=YYYY-MM (ex.: "/" ou "/liquidacoes")
  basePath: string;
};

export async function NavegadorMes({ ano, mes, basePath }: NavegadorMesProps) {
  const t = await getTranslations("common.monthNavigation");
  const atual = mesAtual();
  const isMesAtual = ano === atual.ano && mes === atual.mes;
  const anterior = mesAdjacente(ano, mes, -1);
  const seguinte = mesAdjacente(ano, mes, 1);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("previous")}
        nativeButton={false}
        render={<Link href={`${basePath}?mes=${formatMes(anterior.ano, anterior.mes)}`} />}
      >
        <ChevronLeftIcon />
      </Button>
      {!isMesAtual && (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={basePath} />}>
          {t("current")}
        </Button>
      )}
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("next")}
        nativeButton={false}
        render={<Link href={`${basePath}?mes=${formatMes(seguinte.ano, seguinte.mes)}`} />}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
