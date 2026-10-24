import { useLocale, useTranslations } from "next-intl";

import type { Proprietario, Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao } from "@/lib/types/creditos";
import type { AcordoPagamento } from "@/lib/types/acordos";
import type { CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { FUSO_CARACAS } from "@/lib/fuso";
import { EstadoDeCuenta } from "@/components/unidades/estado-de-cuenta";
import { AcordosPagamento } from "@/components/unidades/acordos-pagamento";
import { ExtratoCreditos, saldoDosCreditos } from "@/components/unidades/extrato-creditos";
import { TabsNaUrl } from "@/components/tabs-na-url";
import { ListaCobrancas } from "@/components/unidades/lista-cobrancas";
import { organizarCobrancas } from "@/lib/lista-cobrancas";
import { ABA_UNIDADE_PADRAO, type AbaUnidade } from "@/lib/abas-unidade";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PortalUnidadeViewProps = {
  // aba aberta ao carregar, vinda de ?aba= (recarregar a página não volta pra primeira)
  abaInicial: AbaUnidade;
  unidade: Omit<Unidade, "proprietario"> & { proprietario: Proprietario | null };
  cobrancas: CobrancaDaUnidade[];
  creditos: CreditoMovimentacao[];
  acordos: AcordoPagamento[];
  cotacoes: (CotacaoHistorico & { id: string })[];
};

// versão só-leitura de UnidadeDetailTabs pro portal público do condômino: mesma UI/dados, mas
// sem LiquidarCobrancaDialog (ação exclusiva do admin) — reusa os mesmos namespaces de i18n
export function PortalUnidadeView({ abaInicial, unidade, cobrancas, creditos, acordos, cotacoes }: PortalUnidadeViewProps) {
  const t = useTranslations("unidadeDetail");
  const locale = useLocale();
  const dateTimeFormatter = new Intl.DateTimeFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FUSO_CARACAS,
  });
  const cotacaoAtual = cotacoes[0] ?? null;

  const saldoFavor = saldoDosCreditos(creditos);

  return (
    <TabsNaUrl
      parametro="aba"
      abaInicial={abaInicial === "acordos" && acordos.length === 0 ? ABA_UNIDADE_PADRAO : abaInicial}
      abaPadrao={ABA_UNIDADE_PADRAO}
    >
      <TabsList>
        <TabsTrigger value="cobrancas">{t("tabs.charges")}</TabsTrigger>
        <TabsTrigger value="estado">{t("tabs.account")}</TabsTrigger>
        <TabsTrigger value="geral">{t("tabs.general")}</TabsTrigger>
        <TabsTrigger value="creditos">{t("tabs.creditStatement")}</TabsTrigger>
        {/* o morador só vê a aba quando tem acordo */}
        {acordos.length > 0 && <TabsTrigger value="acordos">{t("tabs.agreements")}</TabsTrigger>}
      </TabsList>

      <TabsContent value="estado">
        <EstadoDeCuenta
          cobrancas={cobrancas}
          saldoFavor={saldoFavor}
          tasaVes={cotacaoAtual?.tasa_ves ?? null}
        />
      </TabsContent>

      <TabsContent value="geral">
        <Card>
          <CardHeader>
            <CardTitle>{t("general.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.identification")}</dt>
                <dd className="font-medium">{unidade.identificacao}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.owner")}</dt>
                <dd className="font-medium">{unidade.proprietario?.nome ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.document")}</dt>
                <dd className="font-medium">{unidade.proprietario?.documento_identidad ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.phone")}</dt>
                <dd className="font-medium">{unidade.proprietario?.telefone_whatsapp ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.email")}</dt>
                <dd className="font-medium">{unidade.proprietario?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("general.createdAt")}</dt>
                <dd className="font-medium">{dateTimeFormatter.format(new Date(unidade.created_at))}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cobrancas">
        <Card>
          <CardHeader>
            <CardTitle>{t("tabs.charges")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ListaCobrancas
              organizadas={organizarCobrancas(cobrancas, new Date())}
              podeLiquidar={false}
              cotacaoAtual={cotacaoAtual}
              cotacoes={cotacoes}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="creditos">
        <Card>
          <CardHeader>
            <CardTitle>{t("tabs.creditStatement")}</CardTitle>
          </CardHeader>
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
          podeEditar={false} />
      </TabsContent>
    </TabsNaUrl>
  );
}
