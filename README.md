This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase local (Docker)

Requer o Docker Desktop rodando. O CLI do Supabase vem como dependência de desenvolvimento.

```bash
npm run db:start   # sobe Postgres, Auth, API e Studio; aplica migrations + seed na primeira vez
npm run db:status  # mostra URLs e chaves do ambiente local
npm run db:reset   # recria o banco do zero: migrations + seed (apaga os dados locais)
npm run db:stop    # derruba os containers (os dados ficam salvos até um db:reset)
```

| Serviço | URL |
|---|---|
| API | http://127.0.0.1:15431 |
| Studio | http://127.0.0.1:15433 |
| E-mails (Mailpit) | http://127.0.0.1:15434 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:15432/postgres` |

Para o app usar o banco local, crie `.env.development.local` (tem prioridade sobre `.env.local`
no `next dev`) com a URL da API e a `Publishable` key que o `npm run db:status` mostra:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:15431
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Publishable key do db:status>
```

Apague o arquivo para voltar a usar o projeto remoto. O seed cria só as 288
unidades (`supabase/seeds/unidades.sql`) e um usuário admin (`supabase/seed.sql` — as
credenciais estão no topo do arquivo). Taxas, cotações BCV e créditos são cadastrados pelo app.

Migrations novas vão em `supabase/migrations/`. Teste localmente com `npm run db:reset` e depois
aplique no projeto remoto com `npm run db:remoto:migrar`.

### Banco remoto (funciona na VPN)

`supabase db push`/`db reset --linked`/`db query --linked` conectam direto no Postgres (pooler,
portas 5432/6543), o que a VPN derruba. Os comandos abaixo usam a Management API do Supabase, só
HTTPS (`scripts/db-remoto.mjs`). Uma vez só: gere um token pessoal em
https://supabase.com/dashboard/account/tokens e grave em `.env.supabase.local` (fora do git):

```
SUPABASE_ACCESS_TOKEN=sbp_...
```

| Comando | O que faz |
|---|---|
| `npm run db:remoto:status` | lista migrations aplicadas e pendentes |
| `npm run db:remoto:migrar` | aplica todas as pendentes, em ordem |
| `npm run db:remoto:migrar -- 20261012130000` | aplica só essa (versão ou nome do arquivo) |
| `npm run db:remoto:marcar -- 20261012130000` | registra como aplicada sem rodar (aplicada à mão no painel) |
| `npm run db:remoto:zerar` | apaga o schema `public`, reaplica todas as migrations e cria o admin (pede confirmação; usuários do auth ficam) |
| `npm run db:remoto:demo` | carrega `supabase/seeds/demo` (exige banco sem dados) |
| `npm run db:remoto:zerar-com-demo` | os dois acima em sequência |
| `npm run db:remoto:sql -- "select ..."` | roda um SQL avulso |
| `npm run fn:deploy` | publica a Edge Function `atualizar-cotacao-bcv` (pela API, sem Docker) |

O projeto é o linkado em `supabase/.temp/project-ref` (ou `SUPABASE_PROJECT_REF`). O histórico fica
na mesma tabela do CLI, então `supabase db push` volta a funcionar fora da VPN.

### Cotação BCV automática

A Edge Function `atualizar-cotacao-bcv` busca a taxa oficial (DolarApi, com o site do BCV como
reserva) e grava em `cotacao_bcv` (só quando a taxa muda). Ela é chamada por dois caminhos:

- **Ao abrir o app:** toda tela que usa a cotação passa por `garantirCotacaoBcvAtualizada()`
  (`lib/cotacao-bcv.ts`), que chama a função na hora quando a vigente está atrasada em relação ao
  último dia útil. Cada consulta fica em `cotacao_bcv_consulta`, e o app não consulta de novo antes
  de 10 minutos (em feriado o BCV não publica). Abas que ficam abertas são cobertas pelo
  `VigiaCotacaoBcv`, que confere ao voltar pra aba e a cada 5 minutos. O botão "Atualizar cotação
  agora" usa a mesma função.
- **Todo dia útil, pelo Inngest:** `lib/inngest/functions/atualizar-cotacao-bcv.ts` roda às 9h e às
  18h de Caracas, pra taxa de cada dia ficar gravada mesmo que ninguém abra o app. Como o BCV
  publica à tarde a taxa do próximo dia útil, a passada das 18h já pega a de amanhã; se a fonte ainda
  não publicou o esperado, a função dorme 1h e tenta de novo (até 3 consultas). As funções são
  servidas em `/api/inngest`, fora da checagem de sessão do `proxy.ts`.

### Emissão mensal das cuotas pelo Inngest

`lib/inngest/functions/emitir-cobrancas-do-mes.ts` roda todo dia 1 às 6h de Caracas e emite as
cobranças do mês de cada cuota ativa, com unidades vinculadas, cuja competência ainda não foi
fechada: o mesmo que o botão "Emitir cobranças do mês" faz, pela mesma função SQL
(`emitir_cobrancas_taxa`). Competência já fechada é pulada, então rodar de novo não duplica nada.
Cada cuota é um step próprio: se uma falhar, as outras são emitidas e a execução termina como falha
com o motivo. A função grava sem usuário logado, por `lib/supabase/admin.ts`, que exige a chave
secreta do projeto em `SUPABASE_SERVICE_ROLE_KEY` (variável de ambiente só do servidor, nunca
`NEXT_PUBLIC_`).

### Inngest: ambientes

Em desenvolvimento: `INNGEST_DEV=1` no `.env.local` e, com o `npm run dev` de pé,
`npm run inngest:dev` abre o Dev Server em http://localhost:8288, onde dá pra disparar as funções à
mão. Em produção, a integração Inngest ↔ Vercel define `INNGEST_SIGNING_KEY` e `INNGEST_EVENT_KEY` e
sincroniza o app a cada deploy; `SUPABASE_SERVICE_ROLE_KEY` precisa ser cadastrada na Vercel à mão.

Os avisos de cotação atrasada (chip do header e painel) não usam calendário de feriados: se a fonte
foi consultada hoje com sucesso, tudo o que ela publicou já está gravado e a cotação vigente é a
correta, mesmo anterior ao último dia útil (`cotacaoBcvEmDia`). O aviso só aparece quando falta a
do dia e a fonte falhou ou ainda não foi consultada.

No projeto remoto, depois de mudar a função ou as migrations:

1. Publique a função: `npm run fn:deploy`
2. Aplique as migrations: `npm run db:remoto:migrar`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
