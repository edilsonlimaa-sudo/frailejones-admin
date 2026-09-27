"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { Proprietario, Unidade } from "@/lib/types/unidades";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UnidadeFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidade: Unidade | null;
  proprietarios: Proprietario[];
  onSaved: (unidade: Unidade) => void;
  onProprietarioCreated: (proprietario: Proprietario) => void;
};

export function UnidadeFormDialog({
  open,
  onOpenChange,
  unidade,
  proprietarios,
  onSaved,
  onProprietarioCreated,
}: UnidadeFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* remount com estado limpo sempre que o dialog abre (evita setState em effect) */}
        <UnidadeFormFields
          key={open ? (unidade?.id ?? "new") : "closed"}
          unidade={unidade}
          proprietarios={proprietarios}
          onSaved={onSaved}
          onProprietarioCreated={onProprietarioCreated}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type UnidadeFormFieldsProps = {
  unidade: Unidade | null;
  proprietarios: Proprietario[];
  onSaved: (unidade: Unidade) => void;
  onProprietarioCreated: (proprietario: Proprietario) => void;
  onClose: () => void;
};

function UnidadeFormFields({
  unidade,
  proprietarios,
  onSaved,
  onProprietarioCreated,
  onClose,
}: UnidadeFormFieldsProps) {
  const isEditing = Boolean(unidade);
  const t = useTranslations("unidades.form");
  const tCommon = useTranslations("common");

  const [identificacao, setIdentificacao] = useState(unidade?.identificacao ?? "");
  const [proprietarioId, setProprietarioId] = useState<string | null>(
    unidade?.proprietario_id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proprietarioId) {
      setError(t("selectOwnerRequired"));
      return;
    }

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        identificacao: identificacao.trim(),
        proprietario_id: proprietarioId,
      };

      const query = isEditing
        ? supabase.from("unidades").update(payload).eq("id", unidade!.id)
        : supabase.from("unidades").insert(payload);

      const { data, error: saveError } = await query
        .select("id, identificacao, proprietario_id, created_at")
        .single();

      if (saveError) throw saveError;

      const proprietario = proprietarios.find((p) => p.id === data.proprietario_id) ?? null;
      onSaved({
        ...data,
        proprietario: proprietario ? { id: proprietario.id, nome: proprietario.nome } : null,
      });
      toast.success(isEditing ? t("updateSuccess") : t("createSuccess"));
      onClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "code" in err && err.code === "23505"
          ? t("duplicateIdentification")
          : err instanceof Error
            ? err.message
            : t("saveError");
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditing ? t("editTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="identificacao">{t("identificationLabel")}</Label>
          <Input
            id="identificacao"
            placeholder={t("identificationPlaceholder")}
            required
            value={identificacao}
            onChange={(e) => setIdentificacao(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="proprietario">{t("ownerLabel")}</Label>
          <div className="flex gap-2">
            <Select value={proprietarioId} onValueChange={(value) => setProprietarioId(value)}>
              <SelectTrigger id="proprietario" className="w-full">
                <SelectValue placeholder={t("ownerPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {proprietarios.map((proprietario) => (
                  <SelectItem key={proprietario.id} value={proprietario.id}>
                    {proprietario.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("addOwnerAria")}
              onClick={() => setQuickCreateOpen(true)}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tCommon("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </form>

      <ProprietarioQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={(proprietario) => {
          onProprietarioCreated(proprietario);
          setProprietarioId(proprietario.id);
        }}
      />
    </>
  );
}

type ProprietarioQuickCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (proprietario: Proprietario) => void;
};

function ProprietarioQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: ProprietarioQuickCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* remount com campos em branco sempre que o dialog abre */}
        <ProprietarioQuickCreateFields
          key={open ? "open" : "closed"}
          onCreated={onCreated}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProprietarioQuickCreateFields({
  onCreated,
  onClose,
}: {
  onCreated: (proprietario: Proprietario) => void;
  onClose: () => void;
}) {
  const t = useTranslations("unidades.quickCreateOwner");
  const tCommon = useTranslations("common");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: saveError } = await supabase
        .from("proprietarios")
        .insert({
          nome: nome.trim(),
          documento_identidad: documento.trim(),
          telefone_whatsapp: telefone.trim() || null,
          email: email.trim() || null,
        })
        .select("id, nome, documento_identidad, telefone_whatsapp, email")
        .single();

      if (saveError) throw saveError;

      onCreated(data);
      toast.success(t("saveSuccess"));
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveError"));
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
          <Label htmlFor="qc-nome">{t("nameLabel")}</Label>
          <Input id="qc-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="qc-documento">{t("documentLabel")}</Label>
          <Input
            id="qc-documento"
            required
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="qc-telefone">{t("phoneLabel")}</Label>
          <Input id="qc-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="qc-email">{t("emailLabel")}</Label>
          <Input
            id="qc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tCommon("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
