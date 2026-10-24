import { House, IdCard, Mail, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { FUSO_CARACAS } from "@/lib/fuso";
import { INTL_LOCALE } from "@/lib/intl-locale";
import type { Proprietario, Unidade } from "@/lib/types/unidades";
import { AvatarIniciais } from "@/components/admin/avatar-iniciais";
import { Card, CardContent } from "@/components/ui/card";

type DatosUnidadeProps = {
  unidade: Omit<Unidade, "proprietario"> & { proprietario: Proprietario | null };
};

// só dígitos (com o DDI): é o que o link do WhatsApp aceita
const numeroWhatsApp = (telefone: string) => telefone.replace(/\D/g, "");

// Dados de cadastro da unidade em dois cards: o proprietário (avatar grande, documento e contatos
// que abrem o WhatsApp e o e-mail) e a unidade (identificação e data de cadastro). Compartilhado
// entre a ficha do admin e o portal do proprietário.
export function DatosUnidade({ unidade }: DatosUnidadeProps) {
  const t = useTranslations("unidadeDetail.general");
  const locale = useLocale();
  const dateTimeFormatter = new Intl.DateTimeFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: FUSO_CARACAS,
  });
  const dono = unidade.proprietario;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card size="sm">
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t("owner")}</p>
          {dono ? (
            <>
              <div className="flex items-center gap-3">
                <AvatarIniciais nome={dono.nome} className="size-12 text-base" />
                <div className="min-w-0">
                  <p className="truncate text-lg leading-tight font-semibold">{dono.nome}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <IdCard className="size-4 shrink-0" />
                    <span className="truncate tabular-nums">{dono.documento_identidad}</span>
                  </p>
                </div>
              </div>

              {/* contatos como ações: tocar abre o WhatsApp ou o e-mail */}
              <ul className="flex flex-col gap-2 border-t pt-3 text-sm">
                <li className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessageCircle className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("phone")}</p>
                    {dono.telefone_whatsapp ? (
                      <a
                        href={`https://wa.me/${numeroWhatsApp(dono.telefone_whatsapp)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-medium underline-offset-2 hover:underline"
                      >
                        {dono.telefone_whatsapp}
                      </a>
                    ) : (
                      <p className="font-medium text-muted-foreground">—</p>
                    )}
                  </div>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
                    <Mail className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("email")}</p>
                    {dono.email ? (
                      <a href={`mailto:${dono.email}`} className="block truncate font-medium underline-offset-2 hover:underline">
                        {dono.email}
                      </a>
                    ) : (
                      <p className="font-medium text-muted-foreground">—</p>
                    )}
                  </div>
                </li>
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t("unit")}</p>
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <House className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("identification")}</p>
              <p className="text-lg leading-tight font-semibold">{unidade.identificacao}</p>
            </div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">{t("createdAt")}</p>
            <p className="text-sm font-medium">{dateTimeFormatter.format(new Date(unidade.created_at))}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
