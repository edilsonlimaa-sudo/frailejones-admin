import { getTranslations, getLocale } from "next-intl/server";

import { garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import type { CobrancaStatus } from "@/lib/types/cobrancas";
import {
  mesCaixaCaracas,
  montarResumoEntradas,
  percentualEmDia,
  type ResumoDashboard,
} from "@/lib/arrecadacao";
import {
  calcularEncargos,
  pagamentosParaEncargos,
  type AcordoParaEncargos,
  type RegrasEncargos,
} from "@/lib/encargos";
import { diferencaArredondamento } from "@/lib/rateios";
import { hojeCaracas } from "@/lib/fuso";
import { formatMes, hrefDoMes, mesAdjacente, parseMes } from "@/lib/mes";
import { DeslizarMes } from "@/components/admin/painel/deslizar-mes";
import type { PontoEvolucao } from "@/components/admin/painel/evolucao-arrecadacao-chart";
import { PainelFoco } from "@/components/admin/painel/foco/painel-foco";
import { resumirDivida, type CobrancaPendenteTotal } from "@/lib/painel/divida";
import { INTL_LOCALE } from "@/lib/intl-locale";

type CobrancaDoMes = RegrasEncargos & {
  id: string;
  descricao: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  status: CobrancaStatus;
  acordo: AcordoParaEncargos | null;
  unidade: { id: string; identificacao: string } | null;
  // título da origem: a descrição das ordinárias é sempre "Taxa de condomínio", então sem isto
  // a lista de pendentes não distingue a cuota do fundo de reserva
  taxa: { titulo: string } | null;
  despesa: { id: string; titulo: string; valor_total_usd: number; valor_por_unidade_usd: number } | null;
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento: { data_pagamento: string } | null;
  }[];
};

// quantos meses (incluindo o selecionado) o gráfico de evolução mostra
const MESES_EVOLUCAO = 6;

const somarDias = (dataIso: string, dias: number) => {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = parseMes(mesParam);
  // um só "hoje" (Caracas) pra encargos e pro Dashboard no banco
  const hojeIso = hojeCaracas();

  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const mesLabelFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const mesRotuloCurtoFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "short",
    timeZone: "UTC",
  });

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const { ano: anoSeguinte, mes: mesSeguinteNumero } = mesAdjacente(ano, mes, 1);
  const inicioMesSeguinte = `${anoSeguinte}-${String(mesSeguinteNumero).padStart(2, "0")}-01`;
  const mesLabel = mesLabelFormatter.format(new Date(`${inicioMes}T00:00:00Z`));

  const supabase = await createClient();

  const [
    { data: cobrancasRaw, error: cobrancasError },
    { data: cotacaoBcv, error: cotacaoBcvError },
    { data: resumoRaw, error: resumoError },
    { data: pendentesTotaisRaw, error: pendentesTotaisError },
  ] = await Promise.all([
    // paginadas (buscarTodas): um mês de ~300 unidades com 2 taxas e 2 rateios passa das 1000
    // linhas que a API devolve por consulta
    buscarTodas((de, ate) =>
      supabase
        .from("cobrancas")
        .select(
          "id, descricao, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, metodo_encargos, pct_juros_mensal, criterio_mes, acordo:acordos_pagamento(id, data_inicio, quebrado_em), status, unidade:unidades(id, identificacao), taxa:taxa_condominio(titulo), despesa:despesas_extraordinarias(id, titulo, valor_total_usd, valor_por_unidade_usd), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento))",
          { count: "exact" },
        )
        .gte("competencia", inicioMes)
        .lt("competencia", inicioMesSeguinte)
        .order("data_vencimento", { ascending: true })
        .order("id")
        .range(de, ate)
        .returns<CobrancaDoMes[]>(),
    ),
    garantirCotacaoBcvAtualizada().then(() =>
      supabase
        .from("cotacao_bcv")
        .select("data_cotacao, tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(1)
        .maybeSingle<{ data_cotacao: string; tasa_ves: number }>(),
    ),
    // caixa do mês e gráfico de evolução somados no banco: a janela de 6 meses passa das 1000
    // linhas que a API devolve por consulta, e as somas sairiam cortadas sem erro
    supabase.rpc("resumo_dashboard", {
      p_mes: inicioMes,
      p_meses: MESES_EVOLUCAO,
      p_hoje: hojeIso,
    }),
    // tudo que está pendente hoje, de qualquer competência (card de dívida). Paginada: com
    // inadimplência acumulada passa fácil de 1000 cobranças, e um corte silencioso mostraria uma
    // dívida menor que a real. Fica em linhas (não somada no banco) porque multa e juros de hoje
    // são calculados por lib/encargos, a mesma regra das demais telas
    buscarTodas((de, ate) =>
      supabase
        .from("cobrancas")
        .select(
          "id, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, metodo_encargos, pct_juros_mensal, criterio_mes, acordo:acordos_pagamento(id, data_inicio, quebrado_em), status, unidade:unidades(id, identificacao, proprietario:proprietarios(nome)), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento))",
          { count: "exact" },
        )
        .eq("status", "pendente")
        .order("id")
        .range(de, ate)
        .returns<CobrancaPendenteTotal[]>(),
    ),
  ]);

  const loadError = cobrancasError ?? cotacaoBcvError ?? resumoError ?? pendentesTotaisError;
  // a função devolve um único jsonb; sem os tipos gerados do banco, o cliente o tipa como lista
  const resumo = resumoRaw as ResumoDashboard | null;
  if (loadError || !resumo) {
    return (
      <p className="text-sm text-destructive">{t("loadError", { message: loadError?.message ?? "" })}</p>
    );
  }

  const mesSelecionado = formatMes(ano, mes);
  const resumoEntradas = montarResumoEntradas(resumo);

  // quitado = principal abatido pelos pagamentos do mês (em dólar, a moeda da dívida), e não o
  // valor recebido: somar bolívar convertido como se fosse caixa em dólar seria enganoso
  const evolucao: PontoEvolucao[] = resumo.evolucao.map((ponto) => ({
    mes: ponto.mes,
    rotulo: mesRotuloCurtoFormatter.format(new Date(`${ponto.mes}-01T00:00:00Z`)).replace(".", ""),
    emitido: ponto.emitido,
    quitado: ponto.quitado,
    emDia: percentualEmDia(ponto.baseEmDia, ponto.emDia),
  }));

  const cobrancas = cobrancasRaw ?? [];
  const ativas = cobrancas.filter((c) => c.status !== "cancelado");
  const valorEmitido = ativas.reduce((acc, c) => acc + c.valor_usd, 0);
  // centavos que os rateios do mês cobram a mais (ou a menos) que o total da despesa por causa do
  // arredondamento do valor por unidade: o emitido soma as cobranças, não o total das despesas.
  // Todas as cobranças de um rateio têm a mesma competência (o vencimento), então caem neste mês
  const cobrancasPorRateio = new Map<string, { despesa: NonNullable<CobrancaDoMes["despesa"]>; qtd: number }>();
  for (const c of cobrancas) {
    if (!c.despesa) continue;
    const item = cobrancasPorRateio.get(c.despesa.id) ?? { despesa: c.despesa, qtd: 0 };
    item.qtd += 1;
    cobrancasPorRateio.set(c.despesa.id, item);
  }
  const diferencaRedondeo =
    Math.round(
      [...cobrancasPorRateio.values()].reduce(
        (acc, { despesa, qtd }) =>
          acc + diferencaArredondamento(despesa.valor_total_usd, despesa.valor_por_unidade_usd, qtd),
        0,
      ) * 100,
    ) / 100;
  // quitado com crédito não é dinheiro novo entrando no mês: fica separado do quitado com pagamento
  const valorQuitadoComCredito = ativas.reduce((acc, c) => acc + c.valor_credito_abatido_usd, 0);
  // só principal: o emitido não inclui multa/juros, então somá-los aqui faria o quitado passar do
  // emitido. Os encargos pagos aparecem à parte no card de arrecadação
  let valorQuitadoComPagamento = 0;
  let quitadoDepoisDoMes = 0;
  let encargosCobrados = 0;
  for (const c of ativas) {
    for (const p of c.pagamento_cobrancas) {
      valorQuitadoComPagamento += p.valor_principal_abatido_usd;
      encargosCobrados += p.valor_juros_pago_usd;
      // pago num mês de caixa posterior: recuperado depois, não arrecadado dentro do mês
      if (p.pagamento && mesCaixaCaracas(p.pagamento.data_pagamento) > mesSelecionado) {
        quitadoDepoisDoMes += p.valor_principal_abatido_usd;
      }
    }
  }
  const valorArrecadado = valorQuitadoComCredito + valorQuitadoComPagamento;
  const pendentes = ativas.filter((c) => c.status === "pendente");
  const linhasPendentes = pendentes.map((c) => ({
    cobranca: c,
    encargos: calcularEncargos({ ...c, pagamentos: pagamentosParaEncargos(c.pagamento_cobrancas) }, hojeIso),
  }));
  const emAtraso = linhasPendentes.filter((l) => l.encargos.diasAtraso > 0);
  const valorEmAberto = linhasPendentes.reduce((acc, l) => acc + l.encargos.saldoDevedor, 0);
  const valorEmAtrasoComEncargos = emAtraso.reduce(
    (acc, l) => acc + l.encargos.valorTotalComEncargos,
    0,
  );
  const recaudacao = {
    emitido: valorEmitido,
    // saldo a favor é aplicado na emissão, então conta como quitado dentro do mês
    quitadoNoMes: valorArrecadado - quitadoDepoisDoMes,
    quitadoDepois: quitadoDepoisDoMes,
    emAberto: valorEmAberto,
    encargos: encargosCobrados,
    // a janela do gráfico termina no mês selecionado: o último ponto é a pontualidade dele
    percentualEmDia: evolucao.at(-1)?.emDia ?? null,
  };

  const divida = resumirDivida(pendentesTotaisRaw ?? [], hojeIso);

  const mesNomeFormatter = new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" });
  const pontoAnterior = evolucao.at(-2);
  const emDiaAnterior =
    pontoAnterior && pontoAnterior.emDia !== null
      ? {
          percentual: pontoAnterior.emDia,
          mesLabel: mesNomeFormatter.format(new Date(`${pontoAnterior.mes}-01T00:00:00Z`)),
        }
      : null;

  return (
    <DeslizarMes
      anteriorHref={hrefDoMes("/", mesAdjacente(ano, mes, -1))}
      seguinteHref={hrefDoMes("/", mesAdjacente(ano, mes, 1))}
    >
      <PainelFoco
        anoMes={{ ano, mes }}
        mes={mesSelecionado}
        mesLabel={mesLabel}
        tasaVes={cotacaoBcv?.tasa_ves ?? null}
        recaudacao={recaudacao}
        cobrancasEmitidas={ativas.length}
        pendentes={{ quantidade: pendentes.length, valor: valorEmAberto }}
        emAtraso={{ quantidade: emAtraso.length, valor: valorEmAtrasoComEncargos }}
        diferencaRedondeo={diferencaRedondeo}
        emDiaAnterior={emDiaAnterior}
        entradas={resumoEntradas}
        divida={divida}
        pendencias={linhasPendentes.map(({ cobranca: c, encargos }) => ({
          id: c.id,
          unidadeId: c.unidade?.id ?? null,
          unidade: c.unidade?.identificacao ?? null,
          origem: c.taxa?.titulo ?? c.despesa?.titulo ?? c.descricao,
          vencimento: c.data_vencimento,
          fimCarencia:
            c.dias_graca > 0 && c.data_vencimento < hojeIso ? somarDias(c.data_vencimento, c.dias_graca) : null,
          diasAtraso: encargos.diasAtraso,
          total: encargos.valorTotalComEncargos,
        }))}
        evolucao={evolucao}
        mesesEvolucao={MESES_EVOLUCAO}
      />
    </DeslizarMes>
  );
}
