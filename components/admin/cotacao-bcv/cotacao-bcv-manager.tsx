"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { CotacaoBcv } from "@/lib/types/cotacao-bcv";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// API pública usada pelo botão "Atualizar cotação agora" (taxa oficial BCV, sem chave de acesso)
const DOLAR_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial";

type DolarApiResponse = {
  promedio: number | null;
  fechaActualizacion: string;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

type CotacaoBcvManagerProps = {
  cotacoes: CotacaoBcv[];
};

export function CotacaoBcvManager({ cotacoes }: CotacaoBcvManagerProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const atual = cotacoes[0] ?? null;

  const handleAtualizar = async () => {
    setIsUpdating(true);

    try {
      const response = await fetch(DOLAR_API_URL);
      if (!response.ok) throw new Error("Não foi possível consultar a API do BCV.");

      const data: DolarApiResponse = await response.json();
      if (typeof data.promedio !== "number") {
        throw new Error("A API do BCV não retornou uma taxa válida.");
      }

      const dataCotacao = data.fechaActualizacion.slice(0, 10);
      const supabase = createClient();

      const { error } = await supabase
        .from("cotacao_bcv")
        .upsert(
          {
            data_cotacao: dataCotacao,
            tasa_ves: data.promedio,
            fuente: "oficial",
            // created_at não é atualizado automaticamente em upsert (default só vale na inserção);
            // enviamos explicitamente pra "Atualizada em" refletir a última atualização do dia.
            created_at: new Date().toISOString(),
          },
          { onConflict: "data_cotacao" },
        );

      if (error) throw error;

      toast.success(`Cotação atualizada: ${data.promedio} VES/USD`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar cotação.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Cotação BCV</CardTitle>
          <CardDescription>
            Taxa oficial VES/USD usada para converter pagamentos recebidos em bolívares.
          </CardDescription>
          <CardAction>
            <Button onClick={handleAtualizar} disabled={isUpdating}>
              {isUpdating ? "Atualizando..." : "Atualizar cotação agora"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {atual ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Data</dt>
                <dd className="font-medium">{formatDate(atual.data_cotacao)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Taxa (VES/USD)</dt>
                <dd className="font-medium">{atual.tasa_ves}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fonte</dt>
                <dd className="font-medium">{atual.fuente}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma cotação cadastrada ainda. Clique em &ldquo;Atualizar cotação agora&rdquo;.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {cotacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cotação cadastrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Taxa (VES/USD)</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Atualizada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotacoes.map((cotacao) => (
                  <TableRow key={cotacao.id}>
                    <TableCell>{formatDate(cotacao.data_cotacao)}</TableCell>
                    <TableCell>{cotacao.tasa_ves}</TableCell>
                    <TableCell>{cotacao.fuente}</TableCell>
                    <TableCell>{dateTimeFormatter.format(new Date(cotacao.created_at))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
