import type { Proprietario, Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade, CobrancaStatus, CobrancaTipo } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, MovimentacaoTipo } from "@/lib/types/creditos";
import { calcularEncargos } from "@/lib/encargos";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

const cobrancaTipoLabel: Record<CobrancaTipo, string> = {
  ordinaria: "Ordinária",
  extraordinaria: "Extraordinária",
};

const cobrancaStatusLabel: Record<CobrancaStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

const cobrancaStatusVariant: Record<CobrancaStatus, "default" | "outline" | "destructive"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "destructive",
};

const movimentacaoTipoLabel: Record<MovimentacaoTipo, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
};

const movimentacaoTipoVariant: Record<MovimentacaoTipo, "default" | "secondary"> = {
  ENTRADA: "default",
  SAIDA: "secondary",
};

type UnidadeDetailTabsProps = {
  unidade: Omit<Unidade, "proprietario"> & { proprietario: Proprietario | null };
  cobrancas: CobrancaDaUnidade[];
  creditos: CreditoMovimentacao[];
};

export function UnidadeDetailTabs({ unidade, cobrancas, creditos }: UnidadeDetailTabsProps) {
  const saldoUsd = creditos.reduce(
    (acc, c) => acc + (c.tipo === "ENTRADA" ? c.valor_equivalente_usd : -c.valor_equivalente_usd),
    0,
  );

  const hojeIso = new Date().toISOString().slice(0, 10);
  const linhasCobranca = cobrancas.map((cobranca) => ({
    cobranca,
    encargos: calcularEncargos(cobranca, hojeIso),
  }));

  return (
    <Tabs defaultValue="geral">
      <TabsList>
        <TabsTrigger value="geral">Visão geral</TabsTrigger>
        <TabsTrigger value="cobrancas">Cobranças</TabsTrigger>
        <TabsTrigger value="creditos">Extrato de crédito</TabsTrigger>
      </TabsList>

      <TabsContent value="geral">
        <Card>
          <CardHeader>
            <CardTitle>Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Identificação</dt>
                <dd className="font-medium">{unidade.identificacao}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Proprietário</dt>
                <dd className="font-medium">{unidade.proprietario?.nome ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Documento</dt>
                <dd className="font-medium">
                  {unidade.proprietario?.documento_identidad ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Telefone (WhatsApp)</dt>
                <dd className="font-medium">
                  {unidade.proprietario?.telefone_whatsapp ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="font-medium">{unidade.proprietario?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Saldo a favor (USD)</dt>
                <dd className="font-medium">{currencyFormatter.format(saldoUsd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Criada em</dt>
                <dd className="font-medium">{dateTimeFormatter.format(new Date(unidade.created_at))}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cobrancas">
        <Card>
          <CardHeader>
            <CardTitle>Cobranças</CardTitle>
          </CardHeader>
          <CardContent>
            {cobrancas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma cobrança para esta unidade.</p>
            ) : (
              <>
                {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {linhasCobranca.map(({ cobranca, encargos }) => (
                    <div key={cobranca.id} className="rounded-lg border border-input p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{cobranca.descricao}</span>
                        <Badge variant={cobrancaStatusVariant[cobranca.status]}>
                          {cobrancaStatusLabel[cobranca.status]}
                        </Badge>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Competência</dt>
                          <dd>{formatDate(cobranca.competencia)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Tipo</dt>
                          <dd>{cobrancaTipoLabel[cobranca.tipo]}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Valor</dt>
                          <dd>{currencyFormatter.format(cobranca.valor_usd)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Vencimento</dt>
                          <dd>
                            {formatDate(cobranca.data_vencimento)}
                            {encargos.diasAtraso > 0 && (
                              <span className="block text-xs text-destructive">
                                {encargos.diasAtraso} dia(s) em atraso
                              </span>
                            )}
                          </dd>
                        </div>
                        {encargos.diasAtraso > 0 && (
                          <>
                            <div>
                              <dt className="text-xs text-muted-foreground">Multa + juros</dt>
                              <dd>{currencyFormatter.format(encargos.valorMulta + encargos.valorJuros)}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">Total atualizado</dt>
                              <dd className="font-medium">
                                {currencyFormatter.format(encargos.valorTotalComEncargos)}
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                    </div>
                  ))}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Multa + juros</TableHead>
                      <TableHead>Total atualizado</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasCobranca.map(({ cobranca, encargos }) => (
                      <TableRow key={cobranca.id}>
                        <TableCell>{formatDate(cobranca.competencia)}</TableCell>
                        <TableCell>{cobrancaTipoLabel[cobranca.tipo]}</TableCell>
                        <TableCell>{cobranca.descricao}</TableCell>
                        <TableCell>{currencyFormatter.format(cobranca.valor_usd)}</TableCell>
                        <TableCell>
                          {formatDate(cobranca.data_vencimento)}
                          {encargos.diasAtraso > 0 && (
                            <span className="block text-xs text-destructive">
                              {encargos.diasAtraso} dia(s) em atraso
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {encargos.diasAtraso > 0
                            ? currencyFormatter.format(encargos.valorMulta + encargos.valorJuros)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {encargos.diasAtraso > 0
                            ? currencyFormatter.format(encargos.valorTotalComEncargos)
                            : currencyFormatter.format(encargos.saldoDevedor)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cobrancaStatusVariant[cobranca.status]}>
                            {cobrancaStatusLabel[cobranca.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="creditos">
        <Card>
          <CardHeader>
            <CardTitle>Extrato de crédito</CardTitle>
          </CardHeader>
          <CardContent>
            {creditos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma movimentação de crédito para esta unidade.
              </p>
            ) : (
              <>
                {/* mobile: lista de cards (tabela com 6 colunas não cabe bem em telas pequenas) */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {creditos.map((credito) => (
                    <div key={credito.id} className="rounded-lg border border-input p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {dateTimeFormatter.format(new Date(credito.created_at))}
                        </span>
                        <Badge variant={movimentacaoTipoVariant[credito.tipo]}>
                          {movimentacaoTipoLabel[credito.tipo]}
                        </Badge>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Moeda</dt>
                          <dd>{credito.moeda}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Valor</dt>
                          <dd>{credito.valor}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Equivalente USD</dt>
                          <dd>{currencyFormatter.format(credito.valor_equivalente_usd)}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-xs text-muted-foreground">Descrição</dt>
                          <dd>{credito.descricao ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Moeda</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Equivalente USD</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditos.map((credito) => (
                      <TableRow key={credito.id}>
                        <TableCell>{dateTimeFormatter.format(new Date(credito.created_at))}</TableCell>
                        <TableCell>
                          <Badge variant={movimentacaoTipoVariant[credito.tipo]}>
                            {movimentacaoTipoLabel[credito.tipo]}
                          </Badge>
                        </TableCell>
                        <TableCell>{credito.moeda}</TableCell>
                        <TableCell>{credito.valor}</TableCell>
                        <TableCell>{currencyFormatter.format(credito.valor_equivalente_usd)}</TableCell>
                        <TableCell>{credito.descricao ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
