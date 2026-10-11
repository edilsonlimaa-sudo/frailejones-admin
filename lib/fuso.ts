// Calendário do condomínio: Caracas, UTC-4 o ano todo (sem horário de verão). O servidor (Vercel)
// e o Postgres do Supabase rodam em UTC, então "hoje" tirado de toISOString() já é o dia seguinte
// das 20h à meia-noite em Caracas. Todo "hoje"/"mês atual" e todo horário exibido passa por aqui.
export const FUSO_CARACAS = "America/Caracas";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_CARACAS });

// "YYYY-MM-DD" do dia corrente (ou do instante informado) em Caracas
export function hojeCaracas(agora: Date = new Date()): string {
  return formatoDia.format(agora);
}
