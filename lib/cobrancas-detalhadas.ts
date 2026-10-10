import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { MoedaTipo } from "@/lib/types/creditos";
import type { PagamentoDaCobranca } from "@/lib/types/pagamentos";

// Consulta e montagem de cobranças com pagamentos, usadas pelas telas do admin que listam
// cobranças (unidade e rateio). O portal do proprietário mantém uma cópia própria de propósito
// (ver app/portal/unidade/[id]/page.tsx): é uma superfície pública e não compartilha o fetch do admin.

// colunas da cobrança + título da origem + pagamentos (com o crédito que cada um gerou)
export const SELECT_COBRANCA_DETALHADA =
  "id, tipo, descricao, taxa:taxa_condominio(titulo), despesa:despesas_extraordinarias(titulo), competencia, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, tasa_bcv_aplicada, forma_pagamento, referencia_bancaria, observacao, creditos_movimentacoes(valor, moeda)))";

export type CobrancaDetalhadaRow = Omit<
  CobrancaDaUnidade,
  "valor_principal_pago_usd" | "valor_juros_pago_usd" | "data_ultimo_pagamento" | "pagamentos" | "titulo_origem"
> & {
  taxa: { titulo: string } | null;
  despesa: { titulo: string } | null;
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento:
      | (Omit<PagamentoDaCobranca, "valor_principal_abatido_usd" | "valor_juros_pago_usd" | "creditosGerados"> & {
          creditos_movimentacoes: { valor: number; moeda: MoedaTipo }[];
        })
      | null;
  }[];
};

export function montarCobrancaDetalhada({
  pagamento_cobrancas,
  taxa,
  despesa,
  ...cobranca
}: CobrancaDetalhadaRow): CobrancaDaUnidade {
  return {
    ...cobranca,
    titulo_origem: taxa?.titulo ?? despesa?.titulo ?? cobranca.descricao,
    valor_principal_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0),
    valor_juros_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0),
    // data do pagamento mais recente que liquidou esta cobrança, pra congelar o Bs. exibido nessa data
    data_ultimo_pagamento: pagamento_cobrancas.reduce<string | null>(
      (latest, p) =>
        p.pagamento && (!latest || p.pagamento.data_pagamento > latest) ? p.pagamento.data_pagamento : latest,
      null,
    ),
    pagamentos: pagamento_cobrancas
      .filter((p) => p.pagamento !== null)
      .map((p) => {
        const { creditos_movimentacoes, ...pagamento } = p.pagamento!;
        return {
          ...pagamento,
          valor_principal_abatido_usd: p.valor_principal_abatido_usd,
          valor_juros_pago_usd: p.valor_juros_pago_usd,
          creditosGerados: creditos_movimentacoes,
        };
      }),
  };
}
