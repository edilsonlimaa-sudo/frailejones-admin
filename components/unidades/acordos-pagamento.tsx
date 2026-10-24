"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRightIcon, HandshakeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { faltaHoje, resumirAcordo } from "@/lib/acordos";
import { organizarCobrancas } from "@/lib/lista-cobrancas";
import { hojeCaracas } from "@/lib/fuso";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd, type CotacaoHistorico } from "@/lib/moeda";
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
import { ListaCobrancas } from "@/components/unidades/lista-cobrancas";

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
  cotacoes: (CotacaoHistorico & { id: string })[];
  // só o admin registra e quebra acordos; o portal só mostra
  podeEditar: boolean;
};

// aba de acordos de pagamento da unidade (congelam os juros das cobranças em atraso): no admin é
// uma lista, e cada acordo abre a página dele (/acordos/[id]), onde dá pra quebrar; o portal não
// tem essa página, então mostra o detalhe de cada acordo direto na aba
export function AcordosPagamento({ unidadeId, acordos, cobrancas, cotacoes, podeEditar }: AcordosPagamentoProps) {
  const t = useTranslations("acordos");
  const hojeIso = hojeCaracas();
  const [registrando, setRegistrando] = useState(false);
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
        ) : podeEditar ? (
          <ul className="divide-y rounded-lg border">
            {acordos.map((acordo) => (
              <LinhaAcordo
                key={acordo.id}
                acordo={acordo}
                cobrancas={cobrancas.filter((c) => c.acordo?.id === acordo.id)}
                hojeIso={hojeIso}
              />
            ))}
          </ul>
        ) : (
          acordos.map((acordo) => (
            <section key={acordo.id} className="rounded-xl border p-4">
              <DetalheAcordo
                acordo={acordo}
                cobrancas={cobrancas.filter((c) => c.acordo?.id === acordo.id)}
                cotacoes={cotacoes}
                podeEditar={false}
              />
            </section>
          ))
        )}
      </CardContent>

      {podeEditar && (
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
      )}
    </Card>
  );
}

// um acordo na aba da unidade: situação, cobranças, quanto já foi pago e quanto falta; abre a página
function LinhaAcordo({
  acordo,
  cobrancas,
  hojeIso,
}: {
  acordo: AcordoPagamento;
  cobrancas: CobrancaDaUnidade[];
  hojeIso: string;
}) {
  const t = useTranslations("acordos");
  const tLista = useTranslations("acordosPage");
  const { formatDate } = useFormatos();
  const r = resumirAcordo(acordo, cobrancas, hojeIso);

  return (
    <li>
      <Link
        href={`/acordos/${acordo.id}`}
        className="flex flex-col gap-3 px-3 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-6"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {t("since", { date: formatDate(acordo.data_inicio) })}
            <Badge variant={VARIANTE_SITUACAO[r.situacao]}>{t(`status.${r.situacao}`)}</Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {tLista("row.charges", { count: r.cobrancas })}
            {acordo.quebrado_em && ` · ${tLista("row.brokenOn", { date: formatDate(acordo.quebrado_em) })}`}
          </p>
          {acordo.observacao && <p className="mt-0.5 truncate text-xs text-muted-foreground italic">{acordo.observacao}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:w-56">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${r.progresso}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {tLista("row.paid", { value: formatUsd(r.pago), pct: Math.round(r.progresso) })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:w-44 sm:justify-end">
          <div className="sm:text-right">
            <p className={cn("font-medium tabular-nums", r.falta > 0 && "text-destructive")}>
              {r.falta > 0 ? formatUsd(r.falta) : tLista("row.nothingLeft")}
            </p>
            {r.falta > 0 && <p className="text-xs text-muted-foreground">{tLista("row.remaining")}</p>}
          </div>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

const VARIANTE_SITUACAO = {
  vigente: "default",
  cumprido: "secondary",
  quebrado: "destructive",
} as const;

// detalhe de um acordo: números, progresso e as cobranças vinculadas. Usado na página do acordo
// (admin, com o botão de quebrar) e na aba de acordos do portal (só leitura)
export function DetalheAcordo({
  acordo,
  cobrancas,
  cotacoes,
  podeEditar,
}: {
  acordo: AcordoPagamento;
  // só as cobranças deste acordo
  cobrancas: CobrancaDaUnidade[];
  cotacoes: (CotacaoHistorico & { id: string })[];
  // admin: quebrar o acordo vigente e liquidar as cobranças dele
  podeEditar: boolean;
}) {
  const t = useTranslations("acordos");
  const { formatDate } = useFormatos();
  const hojeIso = hojeCaracas();
  const [quebrando, setQuebrando] = useState(false);
  const { situacao, devidoNoInicio, pago, falta, jurosEvitados: evitados, progresso } = resumirAcordo(
    acordo,
    cobrancas,
    hojeIso,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 font-medium">
            <HandshakeIcon className="size-4 text-muted-foreground" />
            {t("since", { date: formatDate(acordo.data_inicio) })}
            <Badge variant={VARIANTE_SITUACAO[situacao]}>{t(`status.${situacao}`)}</Badge>
          </h3>
          {podeEditar && situacao === "vigente" && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setQuebrando(true)}>
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
        {/* a mesma lista da aba Cobros, com liquidar no admin */}
        <ListaCobrancas
          organizadas={organizarCobrancas(cobrancas, new Date())}
          podeLiquidar={podeEditar}
          cotacaoAtual={cotacoes[0] ?? null}
          cotacoes={cotacoes}
        />
      </div>

      {podeEditar && (
        <Dialog open={quebrando} onOpenChange={setQuebrando}>
          <DialogContent>
            {quebrando && <QuebrarAcordo acordo={acordo} hojeIso={hojeIso} onClose={() => setQuebrando(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </div>
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
      const { data, error: rpcError } = await createClient()
        .rpc("criar_acordo_pagamento", {
          p_unidade_id: unidadeId,
          p_data_inicio: dataInicio,
          p_observacao: observacao.trim() || null,
        })
        .single<{ id: string }>();
      if (rpcError) throw rpcError;
      toast.success(t("success"));
      onClose();
      router.push(`/acordos/${data.id}`);
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
              ? t("preview", { count: entram.length, value: formatUsd(entram.reduce((acc, c) => acc + faltaHoje(c, hojeIso), 0)) })
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
