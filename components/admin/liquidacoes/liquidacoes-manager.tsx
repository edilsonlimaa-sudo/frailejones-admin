import Link from "next/link";

import type { Liquidacao } from "@/lib/types/pagamentos";
import type { CobrancaTipo } from "@/lib/types/cobrancas";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const vesNumberFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// valor_recebido já vem na moeda original do pagamento (não precisa converter)
function formatValorRecebido(liquidacao: Liquidacao): string {
  return liquidacao.moeda === "VES"
    ? `Bs. ${vesNumberFormatter.format(liquidacao.valor_recebido)}`
    : currencyFormatter.format(liquidacao.valor_recebido);
}

const cobrancaTipoLabel: Record<CobrancaTipo, string> = {
  ordinaria: "Ordinária",
  extraordinaria: "Extraordinária",
};

const formaPagamentoLabel: Record<FormaPagamentoTipo, string> = {
  pago_movil: "Pago móvil",
  transferencia: "Transferência",
  efectivo_usd: "Efectivo (USD)",
  zelle: "Zelle",
};

type LiquidacoesManagerProps = {
  liquidacoes: Liquidacao[];
};

export function LiquidacoesManager({ liquidacoes }: LiquidacoesManagerProps) {
  const totalArrecadadoUsd = liquidacoes.reduce((acc, l) => acc + l.valor_equivalente_usd, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liquidações</CardTitle>
        <CardDescription>
          {liquidacoes.length} pagamento(s) registrado(s), totalizando{" "}
          {currencyFormatter.format(totalArrecadadoUsd)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {liquidacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma liquidação registrada ainda.</p>
        ) : (
          <>
            {/* mobile: lista de cards */}
            <div className="flex flex-col gap-3 sm:hidden">
              {liquidacoes.map((liquidacao) => (
                <div key={liquidacao.id} className="rounded-lg border border-input p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {liquidacao.unidade ? (
                        <Link
                          href={`/unidades/${liquidacao.unidade.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {liquidacao.unidade.identificacao}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </span>
                    <Badge variant="outline">{formaPagamentoLabel[liquidacao.forma_pagamento]}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Data</dt>
                      <dd>{dateTimeFormatter.format(new Date(liquidacao.data_pagamento))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Cobrança</dt>
                      <dd>
                        {liquidacao.cobranca
                          ? `${liquidacao.cobranca.descricao} (${cobrancaTipoLabel[liquidacao.cobranca.tipo]})`
                          : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Valor recebido</dt>
                      <dd className="font-medium">
                        {formatValorRecebido(liquidacao)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {currencyFormatter.format(liquidacao.valor_equivalente_usd)}
                        </span>
                      </dd>
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
                  <TableHead>Unidade</TableHead>
                  <TableHead>Cobrança</TableHead>
                  <TableHead>Valor recebido</TableHead>
                  <TableHead>Equivalente (USD)</TableHead>
                  <TableHead>Forma de pagamento</TableHead>
                  <TableHead>Referência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidacoes.map((liquidacao) => (
                  <TableRow key={liquidacao.id}>
                    <TableCell>{dateTimeFormatter.format(new Date(liquidacao.data_pagamento))}</TableCell>
                    <TableCell>
                      {liquidacao.unidade ? (
                        <Link
                          href={`/unidades/${liquidacao.unidade.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {liquidacao.unidade.identificacao}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {liquidacao.cobranca
                        ? `${liquidacao.cobranca.descricao} (${cobrancaTipoLabel[liquidacao.cobranca.tipo]})`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatValorRecebido(liquidacao)}</TableCell>
                    <TableCell className="font-medium">
                      {currencyFormatter.format(liquidacao.valor_equivalente_usd)}
                    </TableCell>
                    <TableCell>{formaPagamentoLabel[liquidacao.forma_pagamento]}</TableCell>
                    <TableCell>{liquidacao.referencia_bancaria ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
