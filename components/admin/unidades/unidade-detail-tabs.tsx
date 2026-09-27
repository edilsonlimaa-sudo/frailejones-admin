import type { Proprietario, Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade, CobrancaStatus, CobrancaTipo } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, MovimentacaoTipo } from "@/lib/types/creditos";
import { calcularEncargos } from "@/lib/encargos";
import { encontrarTasaNaData, formatVes, type CotacaoHistorico } from "@/lib/moeda";
import { LiquidarCobrancaDialog } from "@/components/admin/cobrancas/liquidar-cobranca-dialog";
import { VerPagamentoDialog } from "@/components/admin/cobrancas/ver-pagamento-dialog";
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
  cotacoes: (CotacaoHistorico & { id: string })[];
};

export function UnidadeDetailTabs({ unidade, cobrancas, creditos, cotacoes }: UnidadeDetailTabsProps) {
  const cotacaoAtual = cotacoes[0] ?? null;

  // saldo em VES é reconvertido pra USD sempre com a cotação MAIS RECENTE (não a do dia em que
  // o crédito foi gerado) — pedido explícito do usuário, pra refletir o poder de compra atual
  // do saldo em bolívares (diferente do padrão "congela na data" usado nas outras telas)
  // saldo acumulado é calculado em ordem cronológica (mais antigo primeiro) e depois relido na
  // ordem de exibição (mais recente primeiro), já que `creditos` chega ordenado desc por created_at
  const detalhesPorId = new Map<string, { valorEquivalenteExibido: number; saldoAcumulado: number }>();
  let saldoRunning = 0;
  [...creditos].reverse().forEach((credito) => {
    const valorEquivalenteExibido =
      credito.moeda === "VES" && cotacaoAtual
        ? Number((credito.valor / cotacaoAtual.tasa_ves).toFixed(2))
        : credito.valor;
    saldoRunning += credito.tipo === "ENTRADA" ? valorEquivalenteExibido : -valorEquivalenteExibido;
    detalhesPorId.set(credito.id, { valorEquivalenteExibido, saldoAcumulado: Number(saldoRunning.toFixed(2)) });
  });
  const saldoUsd = Number(saldoRunning.toFixed(2));

  const linhasCredito = creditos.map((credito) => {
    const { valorEquivalenteExibido, saldoAcumulado } = detalhesPorId.get(credito.id)!;
    // ENTRADA: origem é a cobrança que o pagamento (que gerou a sobra) liquidou
    // SAIDA: destino é a cobrança onde o crédito foi aplicado como abatimento
    const cobrancaRelacionada = credito.tipo === "SAIDA" ? credito.cobranca : (credito.pagamento?.cobranca ?? null);
    const dataPagamento = credito.tipo === "ENTRADA" ? (credito.pagamento?.data_pagamento ?? null) : null;
    return { credito, valorEquivalenteExibido, saldoAcumulado, cobrancaRelacionada, dataPagamento };
  });

  const hojeIso = new Date().toISOString().slice(0, 10);
  const linhasCobranca = cobrancas.map((cobranca) => {
    const encargos = calcularEncargos(cobranca, hojeIso);
    // já quitada: mostra o que foi de fato pago (histórico), não o saldo dinâmico (que já é 0)
    const multaJuros =
      encargos.diasAtraso > 0 ? encargos.valorMulta + encargos.valorJuros : cobranca.valor_juros_pago_usd;
    const totalAtualizado =
      encargos.diasAtraso > 0
        ? encargos.valorTotalComEncargos
        : cobranca.status === "pendente"
          ? encargos.saldoDevedor
          : cobranca.valor_principal_pago_usd + cobranca.valor_juros_pago_usd;
    // pendente: cotação de hoje (ainda vai pagar); já liquidada: cotação congelada na data do pagamento
    const tasaVesExibir =
      cobranca.status === "pendente"
        ? (cotacaoAtual?.tasa_ves ?? null)
        : encontrarTasaNaData(
            cotacoes,
            (cobranca.data_ultimo_pagamento ?? cobranca.data_vencimento).slice(0, 10),
          );
    return { cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir };
  });

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
                  {linhasCobranca.map(({ cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => (
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
                          <dd>
                            {currencyFormatter.format(cobranca.valor_usd)}
                            {cobranca.valor_credito_abatido_usd > 0 && (
                              <span className="block text-xs text-primary">
                                Crédito aplicado: -{currencyFormatter.format(cobranca.valor_credito_abatido_usd)}
                              </span>
                            )}
                          </dd>
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
                        {multaJuros > 0 && (
                          <div>
                            <dt className="text-xs text-muted-foreground">Multa + juros</dt>
                            <dd>{currencyFormatter.format(multaJuros)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs text-muted-foreground">Total atualizado</dt>
                          <dd className="font-medium">
                            {currencyFormatter.format(totalAtualizado)}
                            {tasaVesExibir != null && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {formatVes(totalAtualizado, tasaVesExibir)}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      {(cobranca.status === "pendente" || cobranca.pagamentos.length > 0) && (
                        <div className="mt-3 flex gap-2">
                          {cobranca.status === "pendente" && (
                            <LiquidarCobrancaDialog
                              unidadeId={unidade.id}
                              cobrancaId={cobranca.id}
                              descricao={cobranca.descricao}
                              saldoDevedorUsd={encargos.saldoDevedor}
                              encargosUsd={encargos.valorMulta + encargos.valorJuros}
                              cotacaoBcv={cotacaoAtual}
                              triggerClassName="flex-1"
                            />
                          )}
                          {cobranca.pagamentos.length > 0 && (
                            <VerPagamentoDialog
                              descricao={cobranca.descricao}
                              dataVencimento={cobranca.data_vencimento}
                              diasGraca={cobranca.dias_graca}
                              pagamentos={cobranca.pagamentos}
                              cotacoes={cotacoes}
                              triggerClassName="flex-1"
                            />
                          )}
                        </div>
                      )}
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
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasCobranca.map(({ cobranca, encargos, multaJuros, totalAtualizado, tasaVesExibir }) => (
                      <TableRow key={cobranca.id}>
                        <TableCell>{formatDate(cobranca.competencia)}</TableCell>
                        <TableCell>{cobrancaTipoLabel[cobranca.tipo]}</TableCell>
                        <TableCell>{cobranca.descricao}</TableCell>
                        <TableCell>
                          {currencyFormatter.format(cobranca.valor_usd)}
                          {cobranca.valor_credito_abatido_usd > 0 && (
                            <span className="block text-xs text-primary">
                              Crédito aplicado: -{currencyFormatter.format(cobranca.valor_credito_abatido_usd)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {formatDate(cobranca.data_vencimento)}
                          {encargos.diasAtraso > 0 && (
                            <span className="block text-xs text-destructive">
                              {encargos.diasAtraso} dia(s) em atraso
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {multaJuros > 0 ? currencyFormatter.format(multaJuros) : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {currencyFormatter.format(totalAtualizado)}
                          {tasaVesExibir != null && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {formatVes(totalAtualizado, tasaVesExibir)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cobrancaStatusVariant[cobranca.status]}>
                            {cobrancaStatusLabel[cobranca.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {cobranca.status === "pendente" && (
                              <LiquidarCobrancaDialog
                                unidadeId={unidade.id}
                                cobrancaId={cobranca.id}
                                descricao={cobranca.descricao}
                                saldoDevedorUsd={encargos.saldoDevedor}
                                encargosUsd={encargos.valorMulta + encargos.valorJuros}
                                cotacaoBcv={cotacaoAtual}
                              />
                            )}
                            {cobranca.pagamentos.length > 0 && (
                              <VerPagamentoDialog
                                descricao={cobranca.descricao}
                                dataVencimento={cobranca.data_vencimento}
                                diasGraca={cobranca.dias_graca}
                                pagamentos={cobranca.pagamentos}
                                cotacoes={cotacoes}
                              />
                            )}
                          </div>
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
                  {linhasCredito.map(
                    ({ credito, valorEquivalenteExibido, saldoAcumulado, cobrancaRelacionada, dataPagamento }) => (
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
                            <dt className="text-xs text-muted-foreground">Valor</dt>
                            <dd>
                              {credito.valor} {credito.moeda}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Equivalente USD</dt>
                            <dd>
                              {currencyFormatter.format(valorEquivalenteExibido)}
                              {credito.moeda === "VES" && cotacaoAtual && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  cotação de hoje: {cotacaoAtual.tasa_ves} VES/USD
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">
                              {credito.tipo === "ENTRADA" ? "Origem (pagamento)" : "Aplicado na cobrança"}
                            </dt>
                            <dd>
                              {cobrancaRelacionada ? (
                                <>
                                  <span className="block font-medium">{cobrancaRelacionada.descricao}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    Competência: {formatDate(cobrancaRelacionada.competencia)}
                                  </span>
                                  {dataPagamento && (
                                    <span className="block text-xs text-muted-foreground">
                                      Pago em: {dateTimeFormatter.format(new Date(dataPagamento))}
                                    </span>
                                  )}
                                </>
                              ) : (
                                (credito.descricao ?? "—")
                              )}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">Saldo acumulado</dt>
                            <dd className="font-medium">{currencyFormatter.format(saldoAcumulado)}</dd>
                          </div>
                        </dl>
                      </div>
                    ),
                  )}
                </div>

                {/* sm+: tabela */}
                <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Equivalente USD</TableHead>
                      <TableHead>Origem / Cobrança aplicada</TableHead>
                      <TableHead>Saldo acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasCredito.map(
                      ({ credito, valorEquivalenteExibido, saldoAcumulado, cobrancaRelacionada, dataPagamento }) => (
                        <TableRow key={credito.id}>
                          <TableCell>{dateTimeFormatter.format(new Date(credito.created_at))}</TableCell>
                          <TableCell>
                            <Badge variant={movimentacaoTipoVariant[credito.tipo]}>
                              {movimentacaoTipoLabel[credito.tipo]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {credito.valor} {credito.moeda}
                          </TableCell>
                          <TableCell>
                            {currencyFormatter.format(valorEquivalenteExibido)}
                            {credito.moeda === "VES" && cotacaoAtual && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                cotação de hoje: {cotacaoAtual.tasa_ves} VES/USD
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {cobrancaRelacionada ? (
                              <>
                                <span className="block font-medium">{cobrancaRelacionada.descricao}</span>
                                <span className="block text-xs text-muted-foreground">
                                  Competência: {formatDate(cobrancaRelacionada.competencia)}
                                </span>
                                {dataPagamento && (
                                  <span className="block text-xs text-muted-foreground">
                                    Pago em: {dateTimeFormatter.format(new Date(dataPagamento))}
                                  </span>
                                )}
                              </>
                            ) : (
                              (credito.descricao ?? "—")
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{currencyFormatter.format(saldoAcumulado)}</TableCell>
                        </TableRow>
                      ),
                    )}
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
