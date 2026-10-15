"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandshakeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { dataCaixaCaracas } from "@/lib/arrecadacao";
import { calcularEncargos } from "@/lib/encargos";
import { hojeCaracas } from "@/lib/fuso";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { AcordoPagamento } from "@/lib/types/acordos";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import { cn } from "@/lib/utils";
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

// cobranças que ainda podem entrar num acordo: pendentes, fora de acordo e em atraso na data
// (mesma regra de criar_acordo_pagamento)
const emAtrasoForaDeAcordo = (cobrancas: CobrancaDaUnidade[], dataIso: string) =>
  cobrancas.filter(
    (c) => c.status === "pendente" && !c.acordo && somarDias(c.data_vencimento, c.dias_graca) < dataIso,
  );

// o que a cobrança deve hoje (cota em aberto + multa/juros de hoje); 0 se já foi paga
const faltaHoje = (c: CobrancaDaUnidade, hojeIso: string) =>
  c.status === "pendente" ? calcularEncargos(c, hojeIso).valorTotalComEncargos : 0;

// o que a cobrança devia num dia passado: só os pagamentos feitos até ele contam
const devidoNaData = (c: CobrancaDaUnidade, dataIso: string) =>
  calcularEncargos(
    {
      ...c,
      status: "pendente",
      pagamentos: c.pagamentos.filter((p) => dataCaixaCaracas(p.data_pagamento) <= dataIso),
    },
    dataIso,
  ).valorTotalComEncargos;

// pagamentos feitos depois do início do acordo (cota + multa/juros)
const pagoNoAcordo = (c: CobrancaDaUnidade, acordo: AcordoPagamento) =>
  c.pagamentos
    .filter((p) => dataCaixaCaracas(p.data_pagamento) > acordo.data_inicio)
    .reduce((acc, p) => acc + p.valor_principal_abatido_usd + p.valor_juros_pago_usd, 0);

// quanto de juros o acordo vigente já evitou hoje: o devido sem acordo menos o devido com ele
const jurosEvitados = (c: CobrancaDaUnidade, hojeIso: string) =>
  c.status === "pendente"
    ? calcularEncargos({ ...c, acordo: null }, hojeIso).valorTotalComEncargos - faltaHoje(c, hojeIso)
    : 0;

const soma = (lista: CobrancaDaUnidade[], valor: (c: CobrancaDaUnidade) => number) =>
  lista.reduce((acc, c) => acc + valor(c), 0);

function useFormatos() {
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  return {
    formatDate: (iso: string) =>
      new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)),
    formatMes: (iso: string) =>
      new Intl.DateTimeFormat(intlLocale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${iso.slice(0, 7)}-01T00:00:00Z`),
      ),
  };
}

type AcordosPagamentoProps = {
  unidadeId: string;
  acordos: AcordoPagamento[];
  cobrancas: CobrancaDaUnidade[];
  // só o admin registra e quebra acordos; o portal só mostra
  podeEditar: boolean;
};

// aba de acordos de pagamento da unidade (congelam os juros das cobranças em atraso): o admin
// registra e quebra; o portal mostra ao morador cada acordo, as cobranças dele e quanto falta
export function AcordosPagamento({ unidadeId, acordos, cobrancas, podeEditar }: AcordosPagamentoProps) {
  const t = useTranslations("acordos");
  const hojeIso = hojeCaracas();
  const [registrando, setRegistrando] = useState(false);
  const [quebrando, setQuebrando] = useState<AcordoPagamento | null>(null);
  const podeRegistrar = podeEditar && emAtrasoForaDeAcordo(cobrancas, hojeIso).length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-2xl flex-col gap-1.5">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("emptyHint")}</CardDescription>
          </div>
          {podeRegistrar && (
            <Button size="sm" onClick={() => setRegistrando(true)}>
              {t("new")}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {acordos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {podeEditar && !podeRegistrar ? t("emptyNoOverdue") : t("empty")}
          </p>
        ) : (
          acordos.map((acordo) => (
            <DetalheAcordo
              key={acordo.id}
              acordo={acordo}
              cobrancas={cobrancas.filter((c) => c.acordo?.id === acordo.id)}
              hojeIso={hojeIso}
              onQuebrar={podeEditar ? () => setQuebrando(acordo) : null}
            />
          ))
        )}
      </CardContent>

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

function DetalheAcordo({
  acordo,
  cobrancas,
  hojeIso,
  onQuebrar,
}: {
  acordo: AcordoPagamento;
  // só as cobranças deste acordo
  cobrancas: CobrancaDaUnidade[];
  hojeIso: string;
  onQuebrar: (() => void) | null;
}) {
  const t = useTranslations("acordos");
  const { formatDate, formatMes } = useFormatos();
  const situacao: SituacaoAcordo = acordo.quebrado_em
    ? "quebrado"
    : cobrancas.some((c) => c.status === "pendente")
      ? "vigente"
      : "cumprido";

  const devidoNoInicio = soma(cobrancas, (c) => devidoNaData(c, acordo.data_inicio));
  const pago = soma(cobrancas, (c) => pagoNoAcordo(c, acordo));
  const falta = soma(cobrancas, (c) => faltaHoje(c, hojeIso));
  const evitados = situacao === "vigente" ? soma(cobrancas, (c) => jurosEvitados(c, hojeIso)) : 0;
  const progresso = pago + falta > 0 ? (pago / (pago + falta)) * 100 : 100;

  return (
    <section className="flex flex-col gap-5 rounded-xl border p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 font-medium">
            <HandshakeIcon className="size-4 text-muted-foreground" />
            {t("since", { date: formatDate(acordo.data_inicio) })}
            <Badge
              variant={situacao === "quebrado" ? "destructive" : situacao === "cumprido" ? "secondary" : "default"}
            >
              {t(`status.${situacao}`)}
            </Badge>
          </h3>
          {onQuebrar && situacao === "vigente" && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onQuebrar}>
              {t("break")}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t(`explanation.${situacao}`, {
            date: formatDate(acordo.data_inicio),
            broken: acordo.quebrado_em ? formatDate(acordo.quebrado_em) : "",
          })}
        </p>
        {acordo.observacao && (
          <p className="mt-1 rounded-lg border-l-2 border-primary/40 bg-muted/50 px-3 py-2 text-sm">
            {acordo.observacao}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metrica rotulo={t("detail.debtAtStart")} valor={formatUsd(devidoNoInicio)} />
        <Metrica rotulo={t("detail.paid")} valor={formatUsd(pago)} />
        <Metrica
          rotulo={t("detail.remaining")}
          valor={formatUsd(falta)}
          className={falta > 0 ? "text-destructive" : undefined}
        />
        {situacao === "vigente" && (
          <Metrica
            rotulo={t("detail.interestAvoided")}
            valor={formatUsd(evitados)}
            dica={t("detail.interestAvoidedHint")}
            className="text-primary"
          />
        )}
      </dl>

      <div className="flex flex-col gap-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${progresso}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{t("detail.progress", { pct: Math.round(progresso) })}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("detail.chargesTitle", { count: cobrancas.length })}</h4>
        <ul className="flex flex-col divide-y rounded-lg border">
          {cobrancas.map((c) => {
            const pagaEm =
              c.status !== "pendente" && c.data_ultimo_pagamento ? dataCaixaCaracas(c.data_ultimo_pagamento) : null;
            const pagoAqui = pagoNoAcordo(c, acordo);
            const faltaAqui = faltaHoje(c, hojeIso);
            return (
              <li key={c.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.titulo_origem}
                    <span className="font-normal text-muted-foreground"> · {formatMes(c.competencia)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("detail.dueOn", { date: formatDate(c.data_vencimento) })}
                    {" · "}
                    {c.status === "pendente"
                      ? t("detail.pendingStatus")
                      : pagaEm
                        ? t("detail.paidOn", { date: formatDate(pagaEm) })
                        : t("detail.settled")}
                  </p>
                </div>
                <div className="flex gap-6 text-sm tabular-nums sm:justify-end">
                  <div className="sm:w-32 sm:text-right">
                    <p className="text-xs text-muted-foreground">{t("detail.paidHere")}</p>
                    <p>{formatUsd(pagoAqui)}</p>
                  </div>
                  <div className="sm:w-32 sm:text-right">
                    <p className="text-xs text-muted-foreground">{t("detail.remainingHere")}</p>
                    <p className={cn("font-medium", faltaAqui > 0 && "text-destructive")}>{formatUsd(faltaAqui)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Metrica({
  rotulo,
  valor,
  dica,
  className,
}: {
  rotulo: string;
  valor: string;
  dica?: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("text-lg font-medium tabular-nums", className)}>{valor}</dd>
      {dica && <dd className="text-xs text-muted-foreground">{dica}</dd>}
    </div>
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

  const { formatDate, formatMes } = useFormatos();
  const entram = dataInicio ? emAtrasoForaDeAcordo(cobrancas, dataInicio) : [];

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
        {/* as cobranças que vão entrar: a lista fica fixa no acordo, as que vencerem depois ficam fora */}
        <div className="flex flex-col gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs">
          <p className="font-medium">
            {entram.length > 0
              ? t("preview", { count: entram.length, value: formatUsd(soma(entram, (c) => faltaHoje(c, hojeIso))) })
              : t("noCharges")}
          </p>
          {entram.length > 0 && (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {entram.map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {c.titulo_origem} · {formatMes(c.competencia)}
                    <span className="text-muted-foreground"> · {t("dueOn", { date: formatDate(c.data_vencimento) })}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatUsd(faltaHoje(c, hojeIso))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
  const { formatDate } = useFormatos();
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
