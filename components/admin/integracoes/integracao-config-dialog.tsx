"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { FlaskConical, Unplug } from "lucide-react";

import type { CampoIntegracao, Integracao } from "@/lib/integracoes";
import { createClient } from "@/lib/supabase/client";
import type { IntegracaoConfigurada } from "@/lib/types/integracoes";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type IntegracaoConfigDialogProps = {
  open: boolean;
  integracao: Integracao | null;
  configurada: IntegracaoConfigurada | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: IntegracaoConfigurada) => void;
  onRemoved: (chave: string) => void;
};

export function IntegracaoConfigDialog({
  open,
  integracao,
  configurada,
  onOpenChange,
  onSaved,
  onRemoved,
}: IntegracaoConfigDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* remount com estado limpo sempre que o dialog abre (evita setState em effect); a
            integração continua montada durante a animação de fechar */}
        {integracao ? (
          <IntegracaoConfigFields
            key={open ? integracao.chave : "closed"}
            integracao={integracao}
            configurada={configurada}
            onSaved={onSaved}
            onRemoved={onRemoved}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type IntegracaoConfigFieldsProps = {
  integracao: Integracao;
  configurada: IntegracaoConfigurada | null;
  onSaved: (item: IntegracaoConfigurada) => void;
  onRemoved: (chave: string) => void;
  onClose: () => void;
};

function valoresIniciais(integracao: Integracao, configurada: IntegracaoConfigurada | null) {
  return Object.fromEntries(
    integracao.campos.map((campo) => [campo.nome, configurada?.config[campo.nome] ?? campo.padrao ?? ""]),
  );
}

function IntegracaoConfigFields({
  integracao,
  configurada,
  onSaved,
  onRemoved,
  onClose,
}: IntegracaoConfigFieldsProps) {
  const t = useTranslations("integracoes");
  const tCommon = useTranslations("common");
  const tItem = (key: string) => t(`items.${integracao.chave}.${key}`);

  const [valores, setValores] = useState<Record<string, string>>(() =>
    valoresIniciais(integracao, configurada),
  );
  const [ativa, setAtiva] = useState(configurada?.ativa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  const set = (nome: string, valor: string) => setValores((atual) => ({ ...atual, [nome]: valor }));

  const faltando = integracao.campos.filter((campo) => campo.obrigatorio && !valores[campo.nome]?.trim());

  // integração de demonstração: o teste só confere os campos e simula a resposta do serviço
  const handleTestar = async () => {
    if (faltando.length > 0) {
      setError(t("missingFields"));
      return;
    }
    setError(null);
    setIsTesting(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setIsTesting(false);
    toast.success(t("testSuccess", { name: tItem("name") }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (faltando.length > 0) {
      setError(t("missingFields"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const config = Object.fromEntries(
        Object.entries(valores).map(([nome, valor]) => [nome, valor.trim()]),
      );
      const { data, error: saveError } = await createClient()
        .from("integracao")
        .upsert({ chave: integracao.chave, ativa, config, atualizado_em: new Date().toISOString() })
        .select("chave, ativa, config, atualizado_em")
        .single<IntegracaoConfigurada>();
      if (saveError) throw saveError;

      onSaved(data);
      toast.success(t("saveSuccess", { name: tItem("name") }));
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemover = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const { error: deleteError } = await createClient()
        .from("integracao")
        .delete()
        .eq("chave", integracao.chave);
      if (deleteError) throw deleteError;

      onRemoved(integracao.chave);
      toast.success(t("removeSuccess", { name: tItem("name") }));
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveError"));
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("dialogTitle", { name: tItem("name") })}</DialogTitle>
        <DialogDescription>{tItem("description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("demoNotice")}
        </p>

        {integracao.campos.map((campo) => (
          <CampoConfig
            key={campo.nome}
            campo={campo}
            id={`${integracao.chave}-${campo.nome}`}
            label={tItem(`fields.${campo.nome}`)}
            placeholder={t.has(`items.${integracao.chave}.placeholders.${campo.nome}`) ? tItem(`placeholders.${campo.nome}`) : undefined}
            opcaoLabel={(opcao) => tItem(`options.${campo.nome}.${opcao}`)}
            value={valores[campo.nome] ?? ""}
            onChange={(valor) => set(campo.nome, valor)}
          />
        ))}

        <div className="flex items-center justify-between rounded-2xl border border-input bg-input/30 px-3 py-2.5">
          <div className="flex flex-col">
            <Label htmlFor={`${integracao.chave}-ativa`}>{tCommon("active")}</Label>
            <span className="text-xs text-muted-foreground">{t("activeHint")}</span>
          </div>
          <Switch id={`${integracao.chave}-ativa`} checked={ativa} onCheckedChange={setAtiva} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          {configurada ? (
            <Button
              type="button"
              variant={confirmandoRemocao ? "destructive" : "ghost"}
              disabled={isSubmitting}
              onClick={() => (confirmandoRemocao ? handleRemover() : setConfirmandoRemocao(true))}
            >
              <Unplug />
              {confirmandoRemocao ? t("confirmRemove") : t("remove")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={isTesting || isSubmitting} onClick={handleTestar}>
              <FlaskConical />
              {isTesting ? t("testing") : t("test")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </>
  );
}

type CampoConfigProps = {
  campo: CampoIntegracao;
  id: string;
  label: string;
  placeholder?: string;
  opcaoLabel: (opcao: string) => string;
  value: string;
  onChange: (valor: string) => void;
};

function CampoConfig({ campo, id, label, placeholder, opcaoLabel, value, onChange }: CampoConfigProps) {
  const rotulo = (
    <Label htmlFor={id}>
      {label}
      {campo.obrigatorio ? <span className="text-destructive">*</span> : null}
    </Label>
  );

  if (campo.tipo === "select") {
    return (
      <div className="grid gap-2">
        {rotulo}
        <Select value={value || null} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={placeholder}>{(v: string | null) => (v ? opcaoLabel(v) : placeholder)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {campo.opcoes?.map((opcao) => (
              <SelectItem key={opcao} value={opcao}>
                {opcaoLabel(opcao)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {rotulo}
      <Input
        id={id}
        type={campo.tipo}
        min={campo.tipo === "number" ? 0 : undefined}
        autoComplete={campo.tipo === "password" ? "off" : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
