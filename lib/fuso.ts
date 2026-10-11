// Calendário do condomínio: Caracas, UTC-4 o ano todo (sem horário de verão). O servidor (Vercel)
// e o Postgres do Supabase rodam em UTC, então "hoje" tirado de toISOString() já é o dia seguinte
// das 20h à meia-noite em Caracas. Todo "hoje"/"mês atual" e todo horário exibido passa por aqui.
export const FUSO_CARACAS = "America/Caracas";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_CARACAS });

const formatoHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_CARACAS,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// "YYYY-MM-DD" do dia corrente (ou do instante informado) em Caracas
export function hojeCaracas(agora: Date = new Date()): string {
  return formatoDia.format(agora);
}

// instante (ISO com offset) do dia informado, na hora atual de Caracas: o dia do pagamento é
// escolhido no formulário e a hora registra quando foi lançado, sem depender do fuso do navegador
export function instanteNoDiaCaracas(dataIso: string, agora: Date = new Date()): string {
  return `${dataIso}T${formatoHora.format(agora)}-04:00`;
}
