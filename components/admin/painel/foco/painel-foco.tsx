import { InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { ResumoEntradas } from "@/lib/arrecadacao";
import type { ResumoDivida } from "@/lib/painel/divida";
import type { RecaudacaoDoMes } from "@/components/admin/painel/recaudacao-do-mes";
import {
  EvolucaoArrecadacaoChart,
  type PontoEvolucao,
} from "@/components/admin/painel/evolucao-arrecadacao-chart";
import { CartaoAtencao, type ItemAtencao } from "@/components/admin/painel/foco/cartao-atencao";
import { CartaoCaixa } from "@/components/admin/painel/foco/cartao-caixa";
import { CartaoDivida } from "@/components/admin/painel/foco/cartao-divida";
import { CartaoPendencias, type PendenciaDoMes } from "@/components/admin/painel/foco/cartao-pendencias";
import { CartaoPulso } from "@/components/admin/painel/foco/cartao-pulso";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PainelFocoProps = {
  // título, mês e controles (navegação de mês e seletor de visão), montados pela página
  cabecalho: React.ReactNode;
  mes: string;
  mesLabel: string;
  tasaVes: number | null;
  itensAtencao: ItemAtencao[];
  recaudacao: RecaudacaoDoMes;
  cobrancasEmitidas: number;
  pendentes: { quantidade: number; valor: number };
  emAtraso: { quantidade: number; valor: number };
  diferencaRedondeo: number;
  emDiaAnterior: { percentual: number; mesLabel: string } | null;
  entradas: ResumoEntradas;
  divida: ResumoDivida;
  pendencias: PendenciaDoMes[];
  evolucao: PontoEvolucao[];
  mesesEvolucao: number;
};

const SECOES = ["pulso", "divida", "caixa", "pendencias", "tendencia"] as const;

// Visão "Foco" do Dashboard, organizada pelas perguntas do administrador, em ordem de urgência:
//   1. o que exige ação agora?      → Precisa de atenção
//   2. como vai a cobrança do mês?  → Pulso (% arrecadado do emitido)
//   3. quem deve, e há quanto tempo? → Dívida até hoje (aging + maiores devedores)
//   4. quanto dinheiro entrou?       → Entradas (por moeda)
//   5. o que falta do mês / tendência
// No desktop vira um grid de 3 colunas (pulso largo + atenção ao lado); no celular, uma coluna na
// mesma ordem com atalhos fixos pras seções, já que a página fica longa
export async function PainelFoco(props: PainelFocoProps) {
  const t = await getTranslations("dashboard");
  const tFoco = await getTranslations("dashboard.focus");

  return (
    <div className="flex flex-col gap-4">
      {props.cabecalho}

      <nav
        aria-label={tFoco("jump.label")}
        className="sticky top-14 z-10 -mx-4 -mt-1 border-b bg-background/85 px-4 py-2 backdrop-blur-md lg:hidden"
      >
        <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECOES.map((secao) => (
            <li key={secao} className="shrink-0">
              <a
                href={`#${secao}`}
                className="inline-flex h-7 items-center rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-muted"
              >
                {tFoco(`jump.${secao}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* no celular a atenção vem antes do pulso: é o que pede ação */}
        <section aria-label={tFoco("attention.title")} className="lg:order-2">
          <CartaoAtencao itens={props.itensAtencao} />
        </section>

        <section id="pulso" className="scroll-mt-28 lg:order-1 lg:col-span-2">
          <CartaoPulso
            mesLabel={props.mesLabel}
            recaudacao={props.recaudacao}
            cobrancasEmitidas={props.cobrancasEmitidas}
            pendentes={props.pendentes}
            emAtraso={props.emAtraso}
            diferencaRedondeo={props.diferencaRedondeo}
            emDiaAnterior={props.emDiaAnterior}
          />
        </section>

        <section id="divida" className="scroll-mt-28 lg:order-4 lg:col-span-2">
          <CartaoDivida divida={props.divida} tasaVes={props.tasaVes} />
        </section>

        <section id="caixa" className="scroll-mt-28 lg:order-3">
          <CartaoCaixa entradas={props.entradas} mes={props.mes} />
        </section>

        <section id="pendencias" className="scroll-mt-28 lg:order-6">
          <CartaoPendencias pendencias={props.pendencias} mesLabel={props.mesLabel} tasaVes={props.tasaVes} />
        </section>

        <section id="tendencia" className="scroll-mt-28 lg:order-5 lg:col-span-2">
          <Card size="sm" className="h-full">
            <CardHeader>
              <CardTitle>{tFoco("trend.title")}</CardTitle>
              <CardDescription>{tFoco("trend.subtitle", { count: props.mesesEvolucao })}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <EvolucaoArrecadacaoChart
                dados={props.evolucao}
                labels={{ emitido: t("chartIssued"), quitado: t("chartSettled"), emDia: t("chartOnTime") }}
              />
              <details className="group rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <InfoIcon className="size-3.5" />
                  {tFoco("trend.howToRead")}
                </summary>
                <p className="mt-2 leading-relaxed">{t("evolutionNote")}</p>
              </details>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
