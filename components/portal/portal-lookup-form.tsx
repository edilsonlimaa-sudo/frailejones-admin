"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";

import { buscarUnidadesPorCedula, type UnidadeEncontrada } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PortalLookupForm() {
  const t = useTranslations("portal.lookup");
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<UnidadeEncontrada[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOpcoes(null);

    startTransition(async () => {
      const { unidades } = await buscarUnidadesPorCedula(cedula);

      if (unidades.length === 0) {
        setError(t("notFound"));
        return;
      }

      if (unidades.length === 1) {
        router.push(`/portal/unidade/${unidades[0].id}`);
        return;
      }

      setOpcoes(unidades);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cedula">{t("cedulaLabel")}</Label>
            <Input
              id="cedula"
              placeholder={t("cedulaPlaceholder")}
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isPending}>
            <SearchIcon />
            {isPending ? t("searching") : t("submit")}
          </Button>
        </form>

        {opcoes && (
          <div className="mt-6 flex flex-col gap-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">{t("multipleFound")}</p>
            {opcoes.map((unidade) => (
              <Button
                key={unidade.id}
                variant="outline"
                className="justify-start"
                nativeButton={false}
                render={<Link href={`/portal/unidade/${unidade.id}`} />}
              >
                {unidade.identificacao}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
