import { ChevronLeftIcon, ChevronRightIcon, Receipt } from "lucide-react";
import Link from "next/link";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmitirCobrancasDoMesButton } from "@/components/admin/taxas-condominio/emitir-cobrancas-do-mes-button";
import { VincularUnidadesTaxaForm } from "@/components/admin/taxas-condominio/vincular-unidades-taxa-form";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const statusLabel = { pendente: "Pendente", pago: "Pago", cancelado: "Cancelado" } as const;
const statusVariant = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
} as const;

type TaxaCondominioDetailTabsProps = {
  taxaId: string;
  valorUsd: number;
  pctMultaAtraso: number;
  pctJurosDiario: number;
  diasGraca: number;
  competencia: string;
  dataVencimento: string;
  mesLabelCapitalizado: string;
  mesAnteriorHref: string;
  mesSeguinteHref: string;
  unidadesDoMes: UnidadeCobrancaDoMes[];
  todasUnidades: { id: string; identificacao: string; proprietario: { id: string; nome: string } | null }[];
  unidadesVinculadasIds: string[];
  competenciaFaturada: boolean;
  dataProcessamento: string | null;
};

export function TaxaCondominioDetailTabs({
  taxaId,
  valorUsd,
  pctMultaAtraso,
  pctJurosDiario,
  diasGraca,
  competencia,
  dataVencimento,
  mesLabelCapitalizado,
  mesAnteriorHref,
  mesSeguinteHref,
  unidadesDoMes,
  todasUnidades,
  unidadesVinculadasIds,
  competenciaFaturada,
  dataProcessamento,
}: TaxaCondominioDetailTabsProps) {
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
    <Tabs defaultValue="emissao" className="gap-4">
      <TabsList>
        <TabsTrigger value="emissao">Emissão mensal</TabsTrigger>
        <TabsTrigger value="unidades">Unidades vinculadas</TabsTrigger>
      </TabsList>

      <TabsContent value="emissao" className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {mesLabelCapitalizado}
                {competenciaFaturada && <Badge variant="outline">Processada</Badge>}
              </CardTitle>
              <CardDescription>
                {emitidas.length} de {unidadesDoMes.length} unidades com cobrança emitida neste mês
                {competenciaFaturada &&
                  dataProcessamento &&
                  ` · fechada em ${dateTimeFormatter.format(new Date(dataProcessamento))}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Mês anterior"
                nativeButton={false}
                render={<Link href={mesAnteriorHref} />}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Próximo mês"
                nativeButton={false}
                render={<Link href={mesSeguinteHref} />}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cobranças emitidas — {mesLabelCapitalizado}</CardTitle>
          </CardHeader>
          <CardContent>
            {unidadesDoMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma unidade vinculada a esta taxa no momento.
              </p>
            ) : emitidas.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input py-10 text-center">
                <Receipt className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma cobrança emitida ainda para {mesLabelCapitalizado.toLowerCase()}.
                </p>
                <EmitirCobrancasDoMesButton
                  taxaId={taxaId}
                  competencia={competencia}
                  dataVencimento={dataVencimento}
                  valorUsd={valorUsd}
                  pctMultaAtraso={pctMultaAtraso}
                  pctJurosDiario={pctJurosDiario}
                  diasGraca={diasGraca}
                  unidades={naoEmitidas.map((u) => ({
                    id: u.unidade_id,
                    identificacao: u.unidade_identificacao,
                  }))}
                  className="self-center"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {emitidas.map((item) => {
                    const cobranca = item.cobranca!;
                    const totalAbatido =
                      cobranca.valor_credito_abatido_usd + cobranca.valor_principal_pago_usd;
                    const saldo = Math.max(cobranca.valor_usd - totalAbatido, 0);

                    return (
                      <div key={cobranca.id} className="rounded-lg border border-input p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{item.unidade_identificacao}</span>
                          <Badge variant={statusVariant[cobranca.status]}>
                            {statusLabel[cobranca.status]}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">Valor</dt>
                            <dd>{currencyFormatter.format(cobranca.valor_usd)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Pago</dt>
                            <dd>{currencyFormatter.format(totalAbatido)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Saldo</dt>
                            <dd>{currencyFormatter.format(saldo)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Vencimento</dt>
                            <dd>{formatDate(cobranca.data_vencimento)}</dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
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
                    {emitidas.map((item) => {
                      const cobranca = item.cobranca!;
                      const totalAbatido =
                        cobranca.valor_credito_abatido_usd + cobranca.valor_principal_pago_usd;
                      const saldo = Math.max(cobranca.valor_usd - totalAbatido, 0);

                      return (
                        <TableRow key={cobranca.id}>
                          <TableCell className="font-medium">{item.unidade_identificacao}</TableCell>
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

                {naoEmitidas.length > 0 && (
                  <EmitirCobrancasDoMesButton
                    taxaId={taxaId}
                    competencia={competencia}
                    dataVencimento={dataVencimento}
                    valorUsd={valorUsd}
                    pctMultaAtraso={pctMultaAtraso}
                    pctJurosDiario={pctJurosDiario}
                    diasGraca={diasGraca}
                    unidades={naoEmitidas.map((u) => ({
                      id: u.unidade_id,
                      identificacao: u.unidade_identificacao,
                    }))}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="unidades">
        <Card>
          <CardHeader>
            <CardTitle>Unidades vinculadas</CardTitle>
            <CardDescription>
              Unidades marcadas recebem cobrança ordinária desta taxa a cada emissão mensal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VincularUnidadesTaxaForm
              taxaId={taxaId}
              todasUnidades={todasUnidades}
              unidadesVinculadasIds={unidadesVinculadasIds}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
