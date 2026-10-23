import { Inngest } from "inngest";

// Cliente do Inngest (filas e agendamentos fora do ciclo de requisição). O id identifica o app no
// painel do Inngest: mudar cria outro app lá. Em desenvolvimento, INNGEST_DEV=1 aponta pro Dev
// Server local (npm run inngest:dev); em produção, a integração do Inngest com a Vercel define
// INNGEST_SIGNING_KEY e INNGEST_EVENT_KEY.
export const inngest = new Inngest({ id: "frailejones-admin" });
