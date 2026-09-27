import Link from "next/link";
import {
  Building2,
  ChevronLeftIcon,
  ChevronRightIcon,
  HardHat,
  Receipt,
} from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
import { calcularEncargos } from "@/lib/encargos";
import { formatVes } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function parseMes(mes: string | undefined) {
  const hoje = new Date();
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, mesNumero] = mes.split("-").map(Number);
    return { ano, mes: mesNumero };
  }
  return { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 };
}

function formatMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function mesAdjacente(ano: number, mes: number, delta: number) {
  const data = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1 };
}

const statusVariant: Record<CobrancaStatus, "outline" | "default" | "destructive"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
};

type CobrancaDoMes = {
  id: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  status: CobrancaStatus;
  unidade: { id: string; identificacao: string } | null;
  pagamento_cobrancas: { valor_principal_abatido_usd: number; valor_juros_pago_usd: number }[];
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  const hoje = new Date();
  const isMesAtual = ano === hoje.getUTCFullYear() && mes === hoje.getUTCMonth() + 1;
  const hojeIso = hoje.toISOString().slice(0, 10);

  const t = await getTranslations("dashboard");
  const tStatus = await getTranslations("cobrancas.status");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const currencyFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
  const mesLabelFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const { ano: anoSeguinte, mes: mesSeguinteNumero } = mesAdjacente(ano, mes, 1);
  const inicioMesSeguinte = `${anoSeguinte}-${String(mesSeguinteNumero).padStart(2, "0")}-01`;
  const mesAnterior = mesAdjacente(ano, mes, -1);
  const mesSeguinte = mesAdjacente(ano, mes, 1);
  const mesLabel = mesLabelFormatter.format(new Date(`${inicioMes}T00:00:00Z`));
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  const supabase = await createClient();

  const [
    { data: cobrancasRaw, error: cobrancasError },
    { data: taxaVinculosRaw, error: taxaVinculosError },
    { data: cotacaoBcv, error: cotacaoBcvError },
  ] = await Promise.all([
      supabase
        .from("cobrancas")
        .select(
          "id, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd)",
        )
        .gte("competencia", inicioMes)
        .lt("competencia", inicioMesSeguinte)
        .order("data_vencimento", { ascending: true })
        .returns<CobrancaDoMes[]>(),
      supabase.from("taxa_condominio_unidades").select("unidade_id").returns<{ unidade_id: string }[]>(),
      supabase
        .from("cotacao_bcv")
        .select("tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ tasa_ves: number }>(),
    ]);

  if (cobrancasError || taxaVinculosError || cotacaoBcvError) {
    return (
      <p className="text-sm text-destructive">
        {t("loadError", {
          message: cobrancasError?.message ?? taxaVinculosError?.message ?? cotacaoBcvError?.message ?? "",
        })}
      </p>
    );
  }

  // conta unidades distintas vinculadas a alguma taxa (uma unidade pode estar em N taxas)
  const unidadesAtivas = new Set((taxaVinculosRaw ?? []).map((v) => v.unidade_id)).size;

  const cobrancas = cobrancasRaw ?? [];
  const ativas = cobrancas.filter((c) => c.status !== "cancelado");
  const valorEmitido = ativas.reduce((acc, c) => acc + c.valor_usd, 0);
  const valorArrecadado = ativas.reduce(
    (acc, c) =>
      acc +
      c.valor_credito_abatido_usd +
      c.pagamento_cobrancas.reduce(
        (sum, p) => sum + p.valor_principal_abatido_usd + p.valor_juros_pago_usd,
        0,
      ),
    0,
  );
  const pendentes = ativas.filter((c) => c.status === "pendente");
  const linhasPendentes = pendentes.map((c) => ({
    cobranca: c,
    encargos: calcularEncargos(
      {
        ...c,
        valor_principal_pago_usd: c.pagamento_cobrancas.reduce(
          (acc, p) => acc + p.valor_principal_abatido_usd,
          0,
        ),
      },
      hojeIso,
    ),
  }));
  const emAtraso = linhasPendentes.filter((l) => l.encargos.diasAtraso > 0);
  const progresso = valorEmitido > 0 ? Math.min(100, (valorArrecadado / valorEmitido) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{mesLabelCapitalizado}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previousMonth")}
            nativeButton={false}
            render={<Link href={`/?mes=${formatMes(mesAnterior.ano, mesAnterior.mes)}`} />}
          >
            <ChevronLeftIcon />
          </Button>
          {!isMesAtual && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/" />}>
              {t("today")}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("nextMonth")}
            nativeButton={false}
            render={<Link href={`/?mes=${formatMes(mesSeguinte.ano, mesSeguinte.mes)}`} />}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("issuedThisMonth")}</CardDescription>
            <CardTitle className="text-xl">{currencyFormatter.format(valorEmitido)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("collectedThisMonth")}</CardDescription>
            <CardTitle className="text-xl">{currencyFormatter.format(valorArrecadado)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("pending")}</CardDescription>
            <CardTitle className="text-xl">{pendentes.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("overdue")}</CardDescription>
            <CardTitle className="text-xl text-destructive">{emAtraso.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("collectionTitle")}</CardTitle>
          <CardDescription>{t("activeUnitsDescription", { count: unidadesAtivas })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progresso} />
          <p className="mt-2 text-xs text-muted-foreground">{t("collectedPercent", { percent: progresso.toFixed(0) })}</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("pendingChargesTitle")}</CardTitle>
          <CardDescription>{t("pendingChargesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPendingCharges")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {linhasPendentes.slice(0, 6).map(({ cobranca: c, encargos }) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {c.unidade?.identificacao ?? t("unitRemoved")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("dueOn", { date: formatDate(c.data_vencimento) })}
                      {encargos.diasAtraso > 0 && (
                        <span className="text-destructive">
                          {" "}
                          · {tStatus("daysOverdue", { count: encargos.diasAtraso })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <span className="font-medium">
                        {currencyFormatter.format(
                          encargos.diasAtraso > 0 ? encargos.valorTotalComEncargos : c.valor_usd,
                        )}
                      </span>
                      {cotacaoBcv && (
                        <p className="text-xs text-muted-foreground">
                          {formatVes(
                            encargos.diasAtraso > 0 ? encargos.valorTotalComEncargos : c.valor_usd,
                            cotacaoBcv.tasa_ves,
                          )}
                        </p>
                      )}
                    </div>
                    <Badge variant={statusVariant[c.status]}>{tStatus(c.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4"
          nativeButton={false}
          render={<Link href="/unidades" />}
        >
          <Building2 className="size-5 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium">{t("shortcutUnidades")}</p>
            <p className="text-xs text-muted-foreground">{t("shortcutUnidadesDescription")}</p>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4"
          nativeButton={false}
          render={<Link href="/taxas-condominio" />}
        >
          <Receipt className="size-5 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium">{t("shortcutTaxas")}</p>
            <p className="text-xs text-muted-foreground">{t("shortcutTaxasDescription")}</p>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4"
          nativeButton={false}
          render={<Link href="/rateios-extraordinarios" />}
        >
          <HardHat className="size-5 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium">{t("shortcutRateios")}</p>
            <p className="text-xs text-muted-foreground">{t("shortcutRateiosDescription")}</p>
          </div>
        </Button>
      </div>
    </div>
  );
}
