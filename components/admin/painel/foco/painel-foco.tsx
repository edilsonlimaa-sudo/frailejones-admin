import { InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { ResumoEntradas } from "@/lib/arrecadacao";
import type { ResumoDivida } from "@/lib/painel/divida";
import type { RecaudacaoDoMes } from "@/components/admin/painel/recaudacao-do-mes";
import {
  EvolucaoArrecadacaoChart,
  type PontoEvolucao,
} from "@/components/admin/painel/evolucao-arrecadacao-chart";
import { AtalhosSecoes } from "@/components/admin/painel/foco/atalhos-secoes";
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

// na ordem em que aparecem no celular (os atalhos seguem a rolagem)
const SECOES = ["pulso", "caixa", "divida", "pendencias", "tendencia"] as const;

// Visão "Foco" do Dashboard, organizada pelas perguntas do administrador, em ordem de urgência:
//   1. como vai a cobrança do mês?  → Pulso (% arrecadado do emitido)
//   2. quanto dinheiro entrou?       → Entradas (por moeda)
//   3. quem deve, e há quanto tempo? → Dívida até hoje (aging + maiores devedores)
//   4. o que falta do mês / tendência
// No desktop vira um grid de 3 colunas (pulso largo + entradas ao lado, dívida larga + pendências
// ao lado, tendência na largura toda); no celular, uma coluna na mesma ordem com atalhos fixos pras
// seções, já que a página fica longa
export async function PainelFoco(props: PainelFocoProps) {
  const t = await getTranslations("dashboard");
  const tFoco = await getTranslations("dashboard.focus");

  return (
    <div className="flex flex-col gap-4">
      {props.cabecalho}

      <AtalhosSecoes
        label={tFoco("jump.label")}
        secoes={SECOES.map((secao) => ({ id: secao, label: tFoco(`jump.${secao}`) }))}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section id="pulso" className="scroll-mt-28 lg:col-span-2">
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

        <section id="caixa" className="scroll-mt-28">
          <CartaoCaixa entradas={props.entradas} mes={props.mes} />
        </section>

        <section id="divida" className="scroll-mt-28 lg:col-span-2">
          <CartaoDivida divida={props.divida} tasaVes={props.tasaVes} />
        </section>

        <section id="pendencias" className="scroll-mt-28">
          <CartaoPendencias pendencias={props.pendencias} mesLabel={props.mesLabel} tasaVes={props.tasaVes} />
        </section>

        <section id="tendencia" className="scroll-mt-28 lg:col-span-3">
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
