import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { CobrancaDoRateio, CobrancaStatus } from "@/lib/types/cobrancas";
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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

const statusLabel: Record<CobrancaStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

const statusVariant: Record<CobrancaStatus, "default" | "outline" | "destructive"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
};

type CobrancaRow = Omit<CobrancaDoRateio, "valor_principal_pago_usd" | "valor_juros_pago_usd"> & {
  pagamento_cobrancas: { valor_principal_abatido_usd: number; valor_juros_pago_usd: number }[];
};

export default async function RateioExtraordinarioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: despesa, error: despesaError } = await supabase
    .from("despesas_extraordinarias")
    .select(
      "id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (despesaError) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {despesaError.message}</p>;
  }

  if (!despesa) {
    notFound();
  }

  const { data: cobrancasRaw, error: cobrancasError } = await supabase
    .from("cobrancas")
    .select(
      "id, descricao, competencia, valor_usd, valor_credito_abatido_usd, data_emissao, data_vencimento, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd)",
    )
    .eq("despesa_extraordinaria_id", id)
    .order("data_vencimento", { ascending: true })
    .returns<CobrancaRow[]>();

  if (cobrancasError) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {cobrancasError.message}</p>;
  }

  const cobrancas: CobrancaDoRateio[] = (cobrancasRaw ?? []).map(
    ({ pagamento_cobrancas, ...cobranca }) => ({
      ...cobranca,
      valor_principal_pago_usd: pagamento_cobrancas.reduce(
        (acc, p) => acc + p.valor_principal_abatido_usd,
        0,
      ),
      valor_juros_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0),
    }),
  );

  const cobrancasAtivas = cobrancas.filter((c) => c.status !== "cancelado");
  const pagas = cobrancas.filter((c) => c.status === "pago").length;
  const pendentes = cobrancas.filter((c) => c.status === "pendente").length;
  const canceladas = cobrancas.filter((c) => c.status === "cancelado").length;

  const valorTotalEsperado = cobrancasAtivas.reduce((acc, c) => acc + c.valor_usd, 0);
  const valorTotalArrecadado = cobrancasAtivas.reduce(
    (acc, c) => acc + c.valor_credito_abatido_usd + c.valor_principal_pago_usd,
    0,
  );
  const progresso =
    valorTotalEsperado > 0
      ? Math.min(100, (valorTotalArrecadado / valorTotalEsperado) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
          nativeButton={false}
          render={<Link href="/rateios-extraordinarios" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{despesa.titulo}</h1>
          {despesa.descricao && (
            <p className="text-sm text-muted-foreground">{despesa.descricao}</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo do rateio</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Valor total</dt>
              <dd className="font-medium">{currencyFormatter.format(despesa.valor_total_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valor por unidade</dt>
              <dd className="font-medium">
                {currencyFormatter.format(despesa.valor_por_unidade_usd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vencimento</dt>
              <dd className="font-medium">{formatDate(despesa.data_vencimento)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Unidades</dt>
              <dd className="font-medium">{cobrancas.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Multa</dt>
              <dd className="font-medium">{despesa.pct_multa_atraso}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Juros/dia</dt>
              <dd className="font-medium">{despesa.pct_juros_diario}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Carência</dt>
              <dd className="font-medium">{despesa.dias_graca} dia(s)</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progresso de pagamento</CardTitle>
          <CardDescription>
            {pagas} de {cobrancas.length} cobranças pagas
            {canceladas > 0 && ` · ${canceladas} cancelada(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress value={progresso} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Arrecadado</p>
              <p className="font-medium">{currencyFormatter.format(valorTotalArrecadado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Esperado</p>
              <p className="font-medium">{currencyFormatter.format(valorTotalEsperado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
              <p className="font-medium">{pendentes}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagas</p>
              <p className="font-medium">{pagas}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cobranças por unidade</CardTitle>
        </CardHeader>
        <CardContent>
          {cobrancas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma cobrança foi gerada para este rateio.
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
                {cobrancas.map((cobranca) => {
                  const totalAbatido =
                    cobranca.valor_credito_abatido_usd + cobranca.valor_principal_pago_usd;
                  const saldo = Math.max(cobranca.valor_usd - totalAbatido, 0);

                  return (
                    <TableRow key={cobranca.id}>
                      <TableCell className="font-medium">
                        {cobranca.unidade?.identificacao ?? "—"}
                      </TableCell>
                      <TableCell>{currencyFormatter.format(cobranca.valor_usd)}</TableCell>
                      <TableCell>{currencyFormatter.format(totalAbatido)}</TableCell>
                      <TableCell>{currencyFormatter.format(saldo)}</TableCell>
                      <TableCell>{formatDate(cobranca.data_vencimento)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[cobranca.status]}>
                          {statusLabel[cobranca.status]}
                        </Badge>
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
