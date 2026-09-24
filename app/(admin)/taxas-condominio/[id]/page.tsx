import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import type { UnidadeCobrancaDoMes } from "@/lib/types/cobrancas";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmitirCobrancasDoMesButton } from "@/components/admin/taxas-condominio/emitir-cobrancas-do-mes-button";

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

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

const statusLabel = { pendente: "Pendente", pago: "Pago", cancelado: "Cancelado" } as const;
const statusVariant = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
} as const;

type CobrancaRow = {
  id: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  status: "pendente" | "pago" | "cancelado";
  unidade: { id: string; identificacao: string } | null;
  pagamento_cobrancas: { valor_principal_abatido_usd: number; valor_juros_pago_usd: number }[];
};

export default async function TaxaCondominioDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const supabase = await createClient();

  const { data: taxa, error: taxaError } = await supabase
    .from("taxa_condominio")
    .select(
      "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, ativo, created_at",
    )
    .eq("id", id)
    .maybeSingle<TaxaCondominio>();

  if (taxaError) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {taxaError.message}</p>;
  }

  if (!taxa) {
    notFound();
  }

  const { ano, mes } = parseMes(mesParam);
  const competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const diaVencimento = Math.min(taxa.dia_vencimento, ultimoDiaDoMes(ano, mes));
  const dataVencimento = `${ano}-${String(mes).padStart(2, "0")}-${String(diaVencimento).padStart(2, "0")}`;
  const mesAnterior = mesAdjacente(ano, mes, -1);
  const mesSeguinte = mesAdjacente(ano, mes, 1);
  const mesLabel = mesLabelFormatter.format(new Date(`${competencia}T00:00:00Z`));
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  const [{ data: unidades, error: unidadesError }, { data: cobrancasRaw, error: cobrancasError }] =
    await Promise.all([
      supabase
        .from("unidades")
        .select("id, identificacao")
        .eq("gera_cobranca", true)
        .order("identificacao", { ascending: true })
        .returns<{ id: string; identificacao: string }[]>(),
      supabase
        .from("cobrancas")
        .select(
          "id, valor_usd, valor_credito_abatido_usd, data_vencimento, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd)",
        )
        .eq("taxa_condominio_id", id)
        .eq("competencia", competencia)
        .returns<CobrancaRow[]>(),
    ]);

  if (unidadesError || cobrancasError) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar dados: {unidadesError?.message ?? cobrancasError?.message}
      </p>
    );
  }

  const cobrancasPorUnidade = new Map((cobrancasRaw ?? []).map((c) => [c.unidade?.id, c]));

  const unidadesDoMes: UnidadeCobrancaDoMes[] = (unidades ?? []).map((unidade) => {
    const cobranca = cobrancasPorUnidade.get(unidade.id);
    return {
      unidade_id: unidade.id,
      unidade_identificacao: unidade.identificacao,
      cobranca: cobranca
        ? {
            id: cobranca.id,
            valor_usd: cobranca.valor_usd,
            valor_credito_abatido_usd: cobranca.valor_credito_abatido_usd,
            data_vencimento: cobranca.data_vencimento,
            status: cobranca.status,
            valor_principal_pago_usd: cobranca.pagamento_cobrancas.reduce(
              (acc, p) => acc + p.valor_principal_abatido_usd,
              0,
            ),
            valor_juros_pago_usd: cobranca.pagamento_cobrancas.reduce(
              (acc, p) => acc + p.valor_juros_pago_usd,
              0,
            ),
          }
        : null,
    };
  });

  const emitidas = unidadesDoMes.filter((u) => u.cobranca !== null);
  const naoEmitidas = unidadesDoMes.filter((u) => u.cobranca === null);
  const emitidasAtivas = emitidas.filter((u) => u.cobranca!.status !== "cancelado");
  const pagas = emitidas.filter((u) => u.cobranca!.status === "pago").length;
  const pendentes = emitidas.filter((u) => u.cobranca!.status === "pendente").length;

  const valorEmitido = emitidasAtivas.reduce((acc, u) => acc + u.cobranca!.valor_usd, 0);
  const valorArrecadado = emitidasAtivas.reduce(
    (acc, u) =>
      acc + u.cobranca!.valor_credito_abatido_usd + u.cobranca!.valor_principal_pago_usd,
    0,
  );
  const progresso = valorEmitido > 0 ? Math.min(100, (valorArrecadado / valorEmitido) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
          nativeButton={false}
          render={<Link href="/taxas-condominio" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{taxa.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {currencyFormatter.format(taxa.valor_usd)} · vencimento todo dia {taxa.dia_vencimento}
          </p>
        </div>
        <Badge variant={taxa.ativo ? "default" : "outline"} className="ml-auto">
          {taxa.ativo ? "Ativa" : "Inativa"}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{mesLabelCapitalizado}</CardTitle>
            <CardDescription>
              {emitidas.length} de {unidadesDoMes.length} unidades com cobrança emitida neste mês
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Mês anterior"
              nativeButton={false}
              render={
                <Link
                  href={`/taxas-condominio/${id}?mes=${formatMes(mesAnterior.ano, mesAnterior.mes)}`}
                />
              }
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Próximo mês"
              nativeButton={false}
              render={
                <Link
                  href={`/taxas-condominio/${id}?mes=${formatMes(mesSeguinte.ano, mesSeguinte.mes)}`}
                />
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress value={progresso} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Arrecadado</p>
              <p className="font-medium">{currencyFormatter.format(valorArrecadado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Emitido</p>
              <p className="font-medium">{currencyFormatter.format(valorEmitido)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagas</p>
              <p className="font-medium">{pagas}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
              <p className="font-medium">{pendentes}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Não emitidas</p>
              <p className="font-medium">{naoEmitidas.length}</p>
            </div>
          </div>

          {naoEmitidas.length > 0 && (
            <EmitirCobrancasDoMesButton
              taxaId={taxa.id}
              competencia={competencia}
              dataVencimento={dataVencimento}
              valorUsd={taxa.valor_usd}
              pctMultaAtraso={taxa.pct_multa_atraso}
              pctJurosDiario={taxa.pct_juros_diario}
              diasGraca={taxa.dias_graca}
              unidades={naoEmitidas.map((u) => ({
                id: u.unidade_id,
                identificacao: u.unidade_identificacao,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unidades — {mesLabelCapitalizado}</CardTitle>
        </CardHeader>
        <CardContent>
          {unidadesDoMes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma unidade gera cobrança ordinária no momento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidadesDoMes.map((item) => {
                  const cobranca = item.cobranca;
                  const totalAbatido = cobranca
                    ? cobranca.valor_credito_abatido_usd + cobranca.valor_principal_pago_usd
                    : 0;
                  const saldo = cobranca ? Math.max(cobranca.valor_usd - totalAbatido, 0) : 0;

                  return (
                    <TableRow key={item.unidade_id}>
                      <TableCell className="font-medium">{item.unidade_identificacao}</TableCell>
                      <TableCell>
                        {cobranca ? currencyFormatter.format(cobranca.valor_usd) : "—"}
                      </TableCell>
                      <TableCell>{cobranca ? currencyFormatter.format(totalAbatido) : "—"}</TableCell>
                      <TableCell>{cobranca ? currencyFormatter.format(saldo) : "—"}</TableCell>
                      <TableCell>
                        {cobranca ? formatDate(cobranca.data_vencimento) : "—"}
                      </TableCell>
                      <TableCell>
                        {cobranca ? (
                          <Badge variant={statusVariant[cobranca.status]}>
                            {statusLabel[cobranca.status]}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Não emitida</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
