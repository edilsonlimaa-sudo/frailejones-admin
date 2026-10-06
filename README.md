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
aplique no projeto remoto com `npx supabase db push`.

### Cotação BCV automática

A Edge Function `atualizar-cotacao-bcv` busca a taxa oficial (DolarApi, com o site do BCV como
reserva) e grava em `cotacao_bcv`. O `pg_cron` chama a função de hora em hora (ela só grava quando a
taxa muda) e o botão "Atualizar cotação agora" usa a mesma função. Se a cotação mais recente for anterior a hoje,
o painel mostra um aviso. No local, tudo já vem configurado pelo `db:start`/`db:reset`.

No projeto remoto, uma vez só:

1. Publique a função: `npx supabase functions deploy atualizar-cotacao-bcv`
2. Aplique a migration do agendamento: `npx supabase db push`
3. No SQL Editor, cadastre a URL do projeto que o cron usa:
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url');`

Para ver as execuções do cron: `select * from cron.job_run_details order by start_time desc;`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
