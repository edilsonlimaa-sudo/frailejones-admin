import Link from "next/link";
import { ArrowLeftIcon, House } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Proprietario, Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao } from "@/lib/types/creditos";
import type { AcordoPagamento } from "@/lib/types/acordos";
import type { CotacaoHistorico } from "@/lib/moeda";
import { EstadoDeCuenta } from "@/components/unidades/estado-de-cuenta";
import { AcordosPagamento } from "@/components/unidades/acordos-pagamento";
import { DatosUnidade } from "@/components/unidades/datos-unidade";
import { ExtratoCreditos, saldoDosCreditos } from "@/components/unidades/extrato-creditos";
import { TabsNaUrl } from "@/components/tabs-na-url";
import { ListaCobrancas } from "@/components/unidades/lista-cobrancas";
import { organizarCobrancas } from "@/lib/lista-cobrancas";
import { ABA_UNIDADE_PADRAO, type AbaUnidade } from "@/lib/abas-unidade";
import { AbaChip, ListaAbasChips } from "@/components/admin/abas-chips";
import { AvatarIniciais } from "@/components/admin/avatar-iniciais";
import { BarraFixa } from "@/components/admin/barra-fixa";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";

type UnidadeDetailTabsProps = {
  // aba aberta ao carregar, vinda de ?aba= (recarregar a página não volta pra primeira)
  abaInicial: AbaUnidade;
  unidade: Omit<Unidade, "proprietario"> & { proprietario: Proprietario | null };
  cobrancas: CobrancaDaUnidade[];
  creditos: CreditoMovimentacao[];
  acordos: AcordoPagamento[];
  cotacoes: (CotacaoHistorico & { id: string })[];
};

// Ficha da unidade. A barra fixa (vidro) leva a volta, a identificação com o dono e as abas como
// chips, então orientação e navegação ficam sempre à vista enquanto o conteúdo rola. As cobranças
// são a aba principal; o estado de conta tem a sua; "datos" guarda o cadastro.
export function UnidadeDetailTabs({ abaInicial, unidade, cobrancas, creditos, acordos, cotacoes }: UnidadeDetailTabsProps) {
  const t = useTranslations("unidadeDetail");
  const tCommon = useTranslations("common");
  const tUnidades = useTranslations("unidades");
  const cotacaoAtual = cotacoes[0] ?? null;

  const saldoFavor = saldoDosCreditos(creditos);

  return (
    <TabsNaUrl parametro="aba" abaInicial={abaInicial} abaPadrao={ABA_UNIDADE_PADRAO} className="gap-4">
      <BarraFixa>
        <div className="flex items-center gap-2 py-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 shrink-0"
            aria-label={tCommon("back")}
            nativeButton={false}
            render={<Link href="/unidades" />}
          >
            <ArrowLeftIcon />
          </Button>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <House className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-bold tracking-tight">{unidade.identificacao}</h1>
            {unidade.proprietario ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <AvatarIniciais nome={unidade.proprietario.nome} className="size-5 text-[9px]" />
                <span className="truncate text-sm text-muted-foreground">{unidade.proprietario.nome}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{tUnidades("noOwnerAssigned")}</p>
            )}
          </div>
        </div>

        <ListaAbasChips aria-label={t("tabs.label")}>
          <AbaChip value="cobrancas">{t("tabs.charges")}</AbaChip>
          <AbaChip value="estado">{t("tabs.account")}</AbaChip>
          <AbaChip value="geral">{t("tabs.general")}</AbaChip>
          <AbaChip value="creditos">{t("tabs.creditStatement")}</AbaChip>
          <AbaChip value="acordos">
            {t("tabs.agreements")}
            {acordos.length > 0 && <span className="tabular-nums opacity-80">{acordos.length}</span>}
          </AbaChip>
        </ListaAbasChips>
      </BarraFixa>

      <TabsContent value="cobrancas">
        {/* direto na página (sem card): filtros e meses grudam abaixo da barra fixa */}
        <ListaCobrancas
          organizadas={organizarCobrancas(cobrancas, new Date())}
          podeLiquidar={true}
          cotacaoAtual={cotacaoAtual}
          cotacoes={cotacoes}
          fixar
        />
      </TabsContent>

      <TabsContent value="estado">
        <EstadoDeCuenta cobrancas={cobrancas} saldoFavor={saldoFavor} tasaVes={cotacaoAtual?.tasa_ves ?? null} />
      </TabsContent>

      <TabsContent value="geral">
        <DatosUnidade unidade={unidade} />
      </TabsContent>

      <TabsContent value="creditos">
        <Card>
          <CardContent>
            <ExtratoCreditos creditos={creditos} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="acordos">
        <AcordosPagamento
          unidadeId={unidade.id}
          acordos={acordos}
          cobrancas={cobrancas}
          cotacoes={cotacoes}
          podeEditar={true}
        />
      </TabsContent>
    </TabsNaUrl>
  );
}
