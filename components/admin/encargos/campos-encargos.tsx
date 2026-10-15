"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

import {
  calcularDiasAtrasoNaData,
  calcularEncargos,
  fimDoMesDeAtraso,
  type CriterioMes,
  type MetodoEncargos,
  type RegrasEncargos,
} from "@/lib/encargos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { Locale } from "@/i18n/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// estado do formulário: campos como texto (inputs controlados), dos dois métodos ao mesmo tempo,
// pra trocar de método e voltar sem perder o que foi digitado
export type RegrasEncargosForm = {
  metodo: MetodoEncargos;
  pctMulta: string;
  pctJurosDiario: string;
  diasGraca: string;
  pctJurosMensal: string;
  criterioMes: CriterioMes;
};

// template novo começa no método mensal (o mais simples); editar mantém o método salvo
export function regrasFormIniciais(regras?: RegrasEncargos): RegrasEncargosForm {
  return {
    metodo: regras?.metodo_encargos ?? "mensal",
    pctMulta: regras ? String(regras.pct_multa_atraso) : "0",
    pctJurosDiario: regras ? String(regras.pct_juros_diario) : "0",
    diasGraca: regras ? String(regras.dias_graca) : "0",
    pctJurosMensal: regras ? String(regras.pct_juros_mensal) : "0",
    criterioMes: regras?.criterio_mes ?? "dias_corridos",
  };
}

// o que vai pro banco: os campos do método que não foi escolhido vão zerados (constraint
// *_campos_do_metodo da migration juros_mensais)
export function regrasDoForm(form: RegrasEncargosForm): RegrasEncargos {
  const diario = form.metodo === "diario";
  return {
    metodo_encargos: form.metodo,
    pct_multa_atraso: diario ? Number(form.pctMulta || 0) : 0,
    pct_juros_diario: diario ? Number(form.pctJurosDiario || 0) : 0,
    dias_graca: diario ? Number(form.diasGraca || 0) : 0,
    pct_juros_mensal: diario ? 0 : Number(form.pctJurosMensal || 0),
    criterio_mes: form.criterioMes,
  };
}

const somarDias = (dataIso: string, dias: number) => {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

// datas de pagamento que mostram onde a regra muda de degrau: no mensal, a véspera e o dia em
// que fecham o 1º e o 2º mês; no diário, o fim da carência e alguns dias depois dele
function datasDeExemplo(regras: RegrasEncargos, vencimento: string): string[] {
  if (regras.metodo_encargos === "mensal") {
    const primeiro = fimDoMesDeAtraso(vencimento, regras.criterio_mes, 1);
    const segundo = fimDoMesDeAtraso(vencimento, regras.criterio_mes, 2);
    return [somarDias(primeiro, -1), primeiro, somarDias(segundo, -1), segundo];
  }
  const prazo = somarDias(vencimento, regras.dias_graca);
  return [prazo, somarDias(prazo, 1), somarDias(prazo, 15), somarDias(prazo, 30)];
}

const METODOS: MetodoEncargos[] = ["mensal", "diario"];

type CamposEncargosProps = {
  value: RegrasEncargosForm;
  onChange: (value: RegrasEncargosForm) => void;
  // base da prévia: o valor e o vencimento reais quando já preenchidos
  valorExemplo: number;
  vencimentoExemplo: string;
};

export function CamposEncargos({ value, onChange, valorExemplo, vencimentoExemplo }: CamposEncargosProps) {
  const t = useTranslations("encargos.form");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as Locale];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  const set = <K extends keyof RegrasEncargosForm>(campo: K, valor: RegrasEncargosForm[K]) =>
    onChange({ ...value, [campo]: valor });

  const regras = regrasDoForm(value);
  const exemplos = datasDeExemplo(regras, vencimentoExemplo).map((data) => {
    const encargos = calcularEncargos(
      {
        ...regras,
        status: "pendente",
        valor_usd: valorExemplo,
        valor_credito_abatido_usd: 0,
        data_vencimento: vencimentoExemplo,
        pagamentos: [],
      },
      data,
    );
    return {
      data,
      dias: calcularDiasAtrasoNaData(vencimentoExemplo, 0, data),
      encargos: encargos.valorMulta + encargos.valorJuros,
    };
  });

  return (
    <fieldset className="flex flex-col gap-3">
      {/* o título do passo do wizard já diz o que é; a legenda fica só pra leitores de tela */}
      <legend className="sr-only">{t("methodLabel")}</legend>

      <div role="radiogroup" aria-label={t("methodLabel")} className="grid grid-cols-2 gap-2">
        {METODOS.map((metodo) => (
          <button
            key={metodo}
            type="button"
            role="radio"
            aria-checked={value.metodo === metodo}
            onClick={() => set("metodo", metodo)}
            className={cn(
              "flex flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-colors",
              value.metodo === metodo
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-input bg-input/30 hover:bg-input/50",
            )}
          >
            <span className="text-sm font-medium">{t(`methods.${metodo}`)}</span>
            <span className="text-xs text-muted-foreground">{t(`methodHints.${metodo}`)}</span>
          </button>
        ))}
      </div>

      {value.metodo === "mensal" ? (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4">
          {/* o critério tem textos longos: a taxa fica estreita e o select pega o resto (min-w-0
              deixa o texto encolher em vez de vazar do modal) */}
          <div className="grid gap-2">
            <Label htmlFor="pct_juros_mensal">{t("monthlyInterestLabel")}</Label>
            <Input
              id="pct_juros_mensal"
              type="number"
              min="0"
              step="0.01"
              value={value.pctJurosMensal}
              onChange={(e) => set("pctJurosMensal", e.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="criterio_mes">{t("monthCriterionLabel")}</Label>
            <Select value={value.criterioMes} onValueChange={(v) => v && set("criterioMes", v as CriterioMes)}>
              <SelectTrigger id="criterio_mes" className="w-full min-w-0">
                <SelectValue>{(v: CriterioMes) => t(`criteria.${v}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dias_corridos">{t("criteria.dias_corridos")}</SelectItem>
                <SelectItem value="mesmo_dia">{t("criteria.mesmo_dia")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pct_multa_atraso">{t("penaltyLabel")}</Label>
            <Input
              id="pct_multa_atraso"
              type="number"
              min="0"
              step="0.01"
              value={value.pctMulta}
              onChange={(e) => set("pctMulta", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pct_juros_diario">{t("dailyInterestLabel")}</Label>
            <Input
              id="pct_juros_diario"
              type="number"
              min="0"
              step="0.0001"
              value={value.pctJurosDiario}
              onChange={(e) => set("pctJurosDiario", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dias_graca">{t("gracePeriodLabel")}</Label>
            <Input
              id="dias_graca"
              type="number"
              min="0"
              step="1"
              value={value.diasGraca}
              onChange={(e) => set("diasGraca", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* prévia calculada com a mesma função das telas: quem configura reconhece a própria regra
          nos números, sem precisar entender a definição */}
      <div className="rounded-2xl border border-dashed px-3 py-2.5 text-xs">
        <p className="mb-1.5 text-muted-foreground">
          {t("previewTitle", { value: formatUsd(valorExemplo), date: formatDate(vencimentoExemplo) })}
        </p>
        <ul className="flex flex-col gap-1">
          {exemplos.map((e) => (
            <li key={e.data} className="flex items-baseline justify-between gap-3">
              <span>
                {t("previewRow", { date: formatDate(e.data) })}
                <span className="text-muted-foreground"> · {t("previewDays", { days: e.dias })}</span>
              </span>
              <span className={cn("tabular-nums", e.encargos > 0 ? "font-medium" : "text-muted-foreground")}>
                {e.encargos > 0 ? t("previewCharges", { value: formatUsd(e.encargos) }) : t("previewNoCharges")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </fieldset>
  );
}
