"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandshakeIcon, PlusIcon } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { AnelProgresso } from "@/components/admin/painel/foco/anel-progresso";
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
  const tLista = useTranslations("acordosPage");
  const hojeIso = hojeCaracas();
  const [registrando, setRegistrando] = useState(false);
  const podeRegistrar = podeEditar && emAtrasoForaDeAcordo(cobrancas, hojeIso).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* cabeçalho enxuto: quantos acordos e a ação de registrar (só quando há cobrança em atraso fora
          de acordo). O que um acordo faz fica explicado no estado vazio e na página do acordo */}
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="text-base font-semibold">
          {t("title")}
          {acordos.length > 0 && (
            <span className="font-normal text-muted-foreground">
              {" · "}
              {tLista("row.agreementsCount", { count: acordos.length })}
            </span>
          )}
        </h3>
        {podeRegistrar && (
          <Button size="sm" onClick={() => setRegistrando(true)}>
            <PlusIcon />
            {t("new")}
          </Button>
        )}
      </div>

      {acordos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
          <HandshakeIcon className="size-8 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">
            {podeEditar && !podeRegistrar ? t("emptyNoOverdue") : t("empty")}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : podeEditar ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {acordos.map((acordo) => (
            <CardAcordo
              key={acordo.id}
              acordo={acordo}
              cobrancas={cobrancas.filter((c) => c.acordo?.id === acordo.id)}
              hojeIso={hojeIso}
            />
          ))}
        </ul>
      ) : (
        acordos.map((acordo) => (
          <Card key={acordo.id} size="sm">
            <CardContent>
              <DetalheAcordo
                acordo={acordo}
                cobrancas={cobrancas.filter((c) => c.acordo?.id === acordo.id)}
                cotacoes={cotacoes}
                podeEditar={false}
              />
            </CardContent>
          </Card>
        ))
      )}

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
    </div>
  );
}

// um acordo na aba da unidade, no mesmo card da listagem de acordos: selo na cor da situação, desde
// quando vale, andamento com anel e o que falta; o card todo abre a página do acordo
function CardAcordo({
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
  const router = useRouter();
  const { formatDate } = useFormatos();
  const r = resumirAcordo(acordo, cobrancas, hojeIso);

  return (
    <li>
      <Card
        size="sm"
        onClick={() => router.push(`/acordos/${acordo.id}`)}
        className="h-full cursor-pointer transition-[box-shadow,--tw-ring-color] hover:shadow-md hover:ring-primary/40"
      >
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TOM_SITUACAO[r.situacao])}>
              <HandshakeIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/acordos/${acordo.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-lg leading-tight font-bold tracking-tight hover:underline"
                >
                  {t("since", { date: formatDate(acordo.data_inicio) })}
                </Link>
                <Badge variant={VARIANTE_SITUACAO[r.situacao]}>{t(`status.${r.situacao}`)}</Badge>
              </p>
              {acordo.observacao && (
                <p className="mt-1 truncate text-xs text-muted-foreground italic">{acordo.observacao}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <AnelProgresso percentual={r.progresso} rotulo={tLista("card.paidLabel")} tamanho={56} espessura={6} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {tLista("card.paidOf", { paid: formatUsd(r.pago), total: formatUsd(r.pago + r.falta) })}
              </p>
              <p className={cn("text-xs", r.falta > 0 ? "text-destructive" : "text-primary")}>
                {r.falta > 0 ? tLista("card.remaining", { value: formatUsd(r.falta) }) : tLista("row.nothingLeft")}
              </p>
              {acordo.quebrado_em && (
                <p className="text-xs text-muted-foreground">{tLista("row.brokenOn", { date: formatDate(acordo.quebrado_em) })}</p>
              )}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
            <span>{tLista("row.charges", { count: r.cobrancas })}</span>
            {r.jurosEvitados > 0 && (
              <span className="shrink-0 font-medium text-primary tabular-nums">
                {tLista("card.frozen", { value: formatUsd(r.jurosEvitados) })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

// selo do card e do detalhe, na cor da situação do acordo
const TOM_SITUACAO = {
  vigente: "bg-primary/10 text-primary",
  cumprido: "bg-muted text-muted-foreground",
  quebrado: "bg-destructive/10 text-destructive",
} as const;

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
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TOM_SITUACAO[situacao])}>
              <HandshakeIcon className="size-5" />
            </span>
            <h3 className="flex flex-wrap items-center gap-2 text-lg leading-tight font-bold tracking-tight">
              {t("since", { date: formatDate(acordo.data_inicio) })}
              <Badge variant={VARIANTE_SITUACAO[situacao]}>{t(`status.${situacao}`)}</Badge>
            </h3>
          </div>
          {podeEditar && situacao === "vigente" && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setQuebrando(true)}>
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

      {/* o andamento: anel com o % pago e os números ao lado */}
      <div className="flex items-center gap-4 rounded-xl bg-muted/40 p-3">
        <AnelProgresso percentual={progresso} rotulo={t("detail.paid")} tamanho={72} espessura={8} />
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-3">
          <Metrica rotulo={t("detail.debtAtStart")} valor={formatUsd(devidoNoInicio)} />
          <Metrica rotulo={t("detail.paid")} valor={formatUsd(pago)} />
          <Metrica
            rotulo={t("detail.remaining")}
            valor={formatUsd(falta)}
            className={falta > 0 ? "text-destructive" : "text-primary"}
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
      <dd className={cn("font-semibold tabular-nums", className)}>{valor}</dd>
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
