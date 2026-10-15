import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";
import { createClient } from "@/lib/supabase/server";
import {
  montarCobrancaDetalhada,
  SELECT_COBRANCA_DETALHADA,
  type CobrancaDetalhadaRow,
} from "@/lib/cobrancas-detalhadas";
import type { AcordoPagamento } from "@/lib/types/acordos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetalheAcordo } from "@/components/unidades/acordos-pagamento";

type AcordoRow = AcordoPagamento & {
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
};

export default async function AcordoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("common");
  const tAcordo = await getTranslations("acordoDetail");

  const [
    { data: acordo, error: acordoError },
    { data: cobrancasRaw, error: cobrancasError },
    { data: cotacoes, error: cotacoesError },
  ] = await Promise.all([
    supabase
      .from("acordos_pagamento")
      .select(
        "id, unidade_id, data_inicio, observacao, quebrado_em, created_at, unidade:unidades(id, identificacao, proprietario:proprietarios(nome))",
      )
      .eq("id", id)
      .maybeSingle<AcordoRow>(),
    supabase
      .from("cobrancas")
      .select(SELECT_COBRANCA_DETALHADA)
      .eq("acordo_pagamento_id", id)
      .order("data_vencimento", { ascending: false })
      .returns<CobrancaDetalhadaRow[]>(),
    // a lista liquida em bolívares: precisa da cotação vigente e do histórico
    garantirCotacaoBcvAtualizada().then(() =>
      supabase
        .from("cotacao_bcv")
        .select("id, data_cotacao, tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(366)
        .returns<{ id: string; data_cotacao: string; tasa_ves: number }[]>(),
    ),
  ]);

  if (acordoError || cobrancasError || cotacoesError) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", { message: acordoError?.message ?? cobrancasError?.message ?? cotacoesError?.message ?? "" })}
      </p>
    );
  }
  if (!acordo) {
    notFound();
  }

  const { unidade, ...dadosAcordo } = acordo;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("back")}
          nativeButton={false}
          render={<Link href="/acordos" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-medium">
            {tAcordo("title", { unit: unidade?.identificacao ?? "—" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {unidade?.proprietario?.nome}
            {unidade && (
              <>
                {unidade.proprietario && " · "}
                <Link href={`/unidades/${unidade.id}?aba=acordos`} className="underline-offset-2 hover:underline">
                  {tAcordo("viewUnit")}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <DetalheAcordo
            acordo={dadosAcordo}
            cobrancas={(cobrancasRaw ?? []).map(montarCobrancaDetalhada)}
            cotacoes={cotacoes ?? []}
            podeEditar
          />
        </CardContent>
      </Card>
    </div>
  );
}
