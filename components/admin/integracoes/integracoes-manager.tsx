"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";

import { CATEGORIAS_INTEGRACAO, INTEGRACOES, type Integracao } from "@/lib/integracoes";
import { createClient } from "@/lib/supabase/client";
import type { IntegracaoConfigurada } from "@/lib/types/integracoes";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { IntegracaoConfigDialog } from "@/components/admin/integracoes/integracao-config-dialog";

type IntegracoesManagerProps = {
  configuradas: IntegracaoConfigurada[];
};

export function IntegracoesManager({ configuradas }: IntegracoesManagerProps) {
  const t = useTranslations("integracoes");
  const [porChave, setPorChave] = useState(
    () => new Map(configuradas.map((item) => [item.chave, item])),
  );
  const [editando, setEditando] = useState<Integracao | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [alternando, setAlternando] = useState<string | null>(null);

  const ativas = [...porChave.values()].filter((item) => item.ativa).length;

  const salvarLocal = (item: IntegracaoConfigurada) =>
    setPorChave((atual) => new Map(atual).set(item.chave, item));

  const removerLocal = (chave: string) =>
    setPorChave((atual) => {
      const novo = new Map(atual);
      novo.delete(chave);
      return novo;
    });

  const handleAlternar = async (integracao: Integracao, ativa: boolean) => {
    setAlternando(integracao.chave);
    try {
      const { data, error } = await createClient()
        .from("integracao")
        .update({ ativa, atualizado_em: new Date().toISOString() })
        .eq("chave", integracao.chave)
        .select("chave, ativa, config, atualizado_em")
        .single<IntegracaoConfigurada>();
      if (error) throw error;
      salvarLocal(data);
      const nome = t(`items.${integracao.chave}.name`);
      toast.success(ativa ? t("activated", { name: nome }) : t("paused", { name: nome }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setAlternando(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <Badge variant="outline">{t("demoBadge")}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("description")} {t("summary", { active: ativas, total: INTEGRACOES.length })}
        </p>
      </div>

      {CATEGORIAS_INTEGRACAO.map((categoria) => (
        <section key={categoria} className="flex flex-col gap-3">
          <h2 className="text-[0.68rem] font-semibold tracking-wider text-muted-foreground uppercase">
            {t(`categories.${categoria}`)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {INTEGRACOES.filter((integracao) => integracao.categoria === categoria).map((integracao) => {
              const configurada = porChave.get(integracao.chave);
              const status = !configurada ? "notConfigured" : configurada.ativa ? "active" : "paused";
              return (
                <Card key={integracao.chave} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl",
                          integracao.cor,
                        )}
                      >
                        <integracao.icone className="size-5" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <CardTitle>{t(`items.${integracao.chave}.name`)}</CardTitle>
                        <StatusBadge status={status} label={t(`status.${status}`)} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardDescription>{t(`items.${integracao.chave}.description`)}</CardDescription>
                  </CardContent>
                  <CardFooter className="justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditando(integracao);
                        setDialogAberto(true);
                      }}
                    >
                      <Settings2 />
                      {configurada ? t("edit") : t("configure")}
                    </Button>
                    {configurada ? (
                      <Switch
                        aria-label={t("toggleLabel", { name: t(`items.${integracao.chave}.name`) })}
                        checked={configurada.ativa}
                        disabled={alternando === integracao.chave}
                        onCheckedChange={(ativa) => handleAlternar(integracao, ativa)}
                      />
                    ) : null}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <IntegracaoConfigDialog
        open={dialogAberto}
        integracao={editando}
        configurada={editando ? (porChave.get(editando.chave) ?? null) : null}
        onOpenChange={setDialogAberto}
        onSaved={salvarLocal}
        onRemoved={removerLocal}
      />
    </div>
  );
}

function StatusBadge({ status, label }: { status: "notConfigured" | "active" | "paused"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "active" && "bg-emerald-500",
          status === "paused" && "bg-amber-500",
          status === "notConfigured" && "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}
