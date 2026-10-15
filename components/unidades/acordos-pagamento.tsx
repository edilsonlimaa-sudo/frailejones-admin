"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandshakeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { calcularEncargos } from "@/lib/encargos";
import { hojeCaracas } from "@/lib/fuso";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { AcordoPagamento } from "@/lib/types/acordos";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SituacaoAcordo = "vigente" | "cumprido" | "quebrado";

// cumprido não tem coluna: é o acordo não quebrado cujas cobranças já foram todas pagas
export function situacaoDoAcordo(acordo: AcordoPagamento, cobrancas: CobrancaDaUnidade[]): SituacaoAcordo {
  if (acordo.quebrado_em) return "quebrado";
  const doAcordo = cobrancas.filter((c) => c.acordo?.id === acordo.id);
  return doAcordo.some((c) => c.status === "pendente") ? "vigente" : "cumprido";
}

const somarDias = (dataIso: string, dias: number) => {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

// o que ainda falta pagar das cobranças (cota em aberto + multa/juros de hoje)
const totalPendente = (cobrancas: CobrancaDaUnidade[], hojeIso: string) =>
  cobrancas.reduce((acc, c) => acc + calcularEncargos(c, hojeIso).valorTotalComEncargos, 0);

type AcordosPagamentoProps = {
  unidadeId: string;
  acordos: AcordoPagamento[];
  cobrancas: CobrancaDaUnidade[];
  // só o admin registra e quebra acordos; o portal só mostra
  podeEditar: boolean;
};

// acordos de pagamento da unidade (congelam os juros das cobranças em atraso): o admin registra e
// quebra; o portal mostra ao morador o acordo e o que ele significa
export function AcordosPagamento({ unidadeId, acordos, cobrancas, podeEditar }: AcordosPagamentoProps) {
  const t = useTranslations("acordos");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const hojeIso = hojeCaracas();
  const [registrando, setRegistrando] = useState(false);
  const [quebrando, setQuebrando] = useState<AcordoPagamento | null>(null);

  // sem acordo e sem nada em atraso fora de acordo, não há o que mostrar
  const emAtrasoForaDeAcordo = cobrancas.filter(
    (c) => c.status === "pendente" && !c.acordo && somarDias(c.data_vencimento, c.dias_graca) < hojeIso,
  );
  if (acordos.length === 0 && (!podeEditar || emAtrasoForaDeAcordo.length === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <HandshakeIcon className="size-4 text-muted-foreground" />
            {t("title")}
          </CardTitle>
          {podeEditar && emAtrasoForaDeAcordo.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setRegistrando(true)}>
              {t("new")}
            </Button>
          )}
        </div>
        {acordos.length === 0 && <CardDescription>{t("emptyHint")}</CardDescription>}
      </CardHeader>

      {acordos.length > 0 && (
        <CardContent>
          <ul className="flex flex-col divide-y rounded-lg border">
            {acordos.map((acordo) => {
              const situacao = situacaoDoAcordo(acordo, cobrancas);
              const doAcordo = cobrancas.filter((c) => c.acordo?.id === acordo.id);
              const pendentes = doAcordo.filter((c) => c.status === "pendente");
              return (
                <li key={acordo.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {t("since", { date: formatDate(acordo.data_inicio) })}
                      <Badge
                        variant={
                          situacao === "quebrado" ? "destructive" : situacao === "cumprido" ? "secondary" : "default"
                        }
                      >
                        {t(`status.${situacao}`)}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`explanation.${situacao}`, {
                        date: formatDate(acordo.data_inicio),
                        broken: acordo.quebrado_em ? formatDate(acordo.quebrado_em) : "",
                      })}
                    </p>
                    {acordo.observacao && <p className="mt-1 text-sm">{acordo.observacao}</p>}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="text-left text-sm sm:text-right">
                      <p className="text-muted-foreground">{t("charges", { count: doAcordo.length })}</p>
                      {pendentes.length > 0 && (
                        <p className="font-medium tabular-nums">
                          {t("pending", { value: formatUsd(totalPendente(pendentes, hojeIso)) })}
                        </p>
                      )}
                    </div>
                    {podeEditar && situacao === "vigente" && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setQuebrando(acordo)}>
                        {t("break")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}

      {podeEditar && (
        <>
          <Dialog open={registrando} onOpenChange={setRegistrando}>
            <DialogContent>
              {/* remount com estado limpo a cada abertura */}
              {registrando && (
                <RegistrarAcordo
                  unidadeId={unidadeId}
                  cobrancas={cobrancas}
                  hojeIso={hojeIso}
                  onClose={() => setRegistrando(false)}
                />
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={quebrando !== null} onOpenChange={(open) => !open && setQuebrando(null)}>
            <DialogContent>
              {quebrando && <QuebrarAcordo acordo={quebrando} hojeIso={hojeIso} onClose={() => setQuebrando(null)} />}
            </DialogContent>
          </Dialog>
        </>
      )}
    </Card>
  );
}

function RegistrarAcordo({
  unidadeId,
  cobrancas,
  hojeIso,
  onClose,
}: {
  unidadeId: string;
  cobrancas: CobrancaDaUnidade[];
  hojeIso: string;
  onClose: () => void;
}) {
  const t = useTranslations("acordos.form");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [dataInicio, setDataInicio] = useState(hojeIso);
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // mesma regra de criar_acordo_pagamento: pendentes, fora de acordo e em atraso na data de início
  const entram = cobrancas.filter(
    (c) => c.status === "pendente" && !c.acordo && somarDias(c.data_vencimento, c.dias_graca) < dataInicio,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const { error: rpcError } = await createClient().rpc("criar_acordo_pagamento", {
        p_unidade_id: unidadeId,
        p_data_inicio: dataInicio,
        p_observacao: observacao.trim() || null,
      });
      if (rpcError) throw rpcError;
      toast.success(t("success"));
      onClose();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="acordo_data_inicio">{t("startLabel")}</Label>
          <Input
            id="acordo_data_inicio"
            type="date"
            required
            max={hojeIso}
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="acordo_observacao">{t("noteLabel")}</Label>
          <Textarea
            id="acordo_observacao"
            placeholder={t("notePlaceholder")}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
        <p className="rounded-xl bg-muted px-3 py-2 text-xs">
          {entram.length > 0
            ? t("preview", { count: entram.length, value: formatUsd(totalPendente(entram, hojeIso)) })
            : t("noCharges")}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting || entram.length === 0 || !dataInicio}>
            {isSubmitting ? tCommon("saving") : t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function QuebrarAcordo({
  acordo,
  hojeIso,
  onClose,
}: {
  acordo: AcordoPagamento;
  hojeIso: string;
  onClose: () => void;
}) {
  const t = useTranslations("acordos.breakForm");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], { timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const [data, setData] = useState(hojeIso);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const { error: rpcError } = await createClient().rpc("quebrar_acordo_pagamento", {
        p_acordo_id: acordo.id,
        p_data: data,
      });
      if (rpcError) throw rpcError;
      toast.success(t("success"));
      onClose();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description", { date: formatDate(acordo.data_inicio) })}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="acordo_data_quebra">{t("dateLabel")}</Label>
          <Input
            id="acordo_data_quebra"
            type="date"
            required
            min={acordo.data_inicio}
            max={hojeIso}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" variant="destructive" disabled={isSubmitting || !data}>
            {isSubmitting ? tCommon("saving") : t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
