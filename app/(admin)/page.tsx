import Link from "next/link";
import {
  Building2,
  ChevronLeftIcon,
  ChevronRightIcon,
  HardHat,
  Receipt,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

const mesLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

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

const statusLabel: Record<CobrancaStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};
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

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const { ano: anoSeguinte, mes: mesSeguinteNumero } = mesAdjacente(ano, mes, 1);
  const inicioMesSeguinte = `${anoSeguinte}-${String(mesSeguinteNumero).padStart(2, "0")}-01`;
  const mesAnterior = mesAdjacente(ano, mes, -1);
  const mesSeguinte = mesAdjacente(ano, mes, 1);
  const mesLabel = mesLabelFormatter.format(new Date(`${inicioMes}T00:00:00Z`));
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  const supabase = await createClient();

  const [{ data: cobrancasRaw, error: cobrancasError }, { data: taxaVinculosRaw, error: taxaVinculosError }] =
    await Promise.all([
      supabase
        .from("cobrancas")
        .select(
          "id, valor_usd, valor_credito_abatido_usd, data_vencimento, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd)",
        )
        .gte("competencia", inicioMes)
        .lt("competencia", inicioMesSeguinte)
        .order("data_vencimento", { ascending: true })
        .returns<CobrancaDoMes[]>(),
      supabase.from("taxa_condominio_unidades").select("unidade_id").returns<{ unidade_id: string }[]>(),
    ]);

  if (cobrancasError || taxaVinculosError) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar dados: {cobrancasError?.message ?? taxaVinculosError?.message}
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
      c.pagamento_cobrancas.reduce((sum, p) => sum + p.valor_principal_abatido_usd, 0),
    0,
  );
  const pendentes = ativas.filter((c) => c.status === "pendente");
  const emAtraso = pendentes.filter((c) => c.data_vencimento < hojeIso);
  const progresso = valorEmitido > 0 ? Math.min(100, (valorArrecadado / valorEmitido) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-medium">Painel</h1>
          <p className="text-sm text-muted-foreground">{mesLabelCapitalizado}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mês anterior"
            nativeButton={false}
            render={<Link href={`/?mes=${formatMes(mesAnterior.ano, mesAnterior.mes)}`} />}
          >
            <ChevronLeftIcon />
          </Button>
          {!isMesAtual && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/" />}>
              Hoje
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próximo mês"
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
            <CardDescription>Emitido no mês</CardDescription>
            <CardTitle className="text-xl">{currencyFormatter.format(valorEmitido)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Arrecadado no mês</CardDescription>
            <CardTitle className="text-xl">{currencyFormatter.format(valorArrecadado)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Pendentes</CardDescription>
            <CardTitle className="text-xl">{pendentes.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Em atraso</CardDescription>
            <CardTitle className="text-xl text-destructive">{emAtraso.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Arrecadação do mês</CardTitle>
          <CardDescription>
            {unidadesAtivas} unidade(s) ativa(s) na emissão de cobranças
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progresso} />
          <p className="mt-2 text-xs text-muted-foreground">
            {progresso.toFixed(0)}% arrecadado
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Cobranças pendentes</CardTitle>
          <CardDescription>Vencimentos do mês selecionado</CardDescription>
        </CardHeader>
        <CardContent>
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança pendente neste mês.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pendentes.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {c.unidade?.identificacao ?? "Unidade removida"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vence em {formatDate(c.data_vencimento)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{currencyFormatter.format(c.valor_usd)}</span>
                    <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
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
            <p className="text-sm font-medium">Unidades</p>
            <p className="text-xs text-muted-foreground">Unidades e proprietários</p>
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
            <p className="text-sm font-medium">Taxas de Condomínio</p>
            <p className="text-xs text-muted-foreground">Cobrança ordinária mensal</p>
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
            <p className="text-sm font-medium">Rateios Extraordinários</p>
            <p className="text-xs text-muted-foreground">Despesas rateadas entre unidades</p>
          </div>
        </Button>
      </div>
    </div>
  );
}
