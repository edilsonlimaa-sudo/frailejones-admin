// Operações no banco do projeto Supabase remoto pela Management API (HTTPS), sem o CLI.
//
// Por quê: `supabase db push`, `db reset --linked` e até `db query --linked` abrem conexão direta
// com o Postgres (pooler, portas 5432/6543), que a VPN derruba. A Management API roda o SQL do lado
// do Supabase e só precisa de HTTPS, que passa pela VPN.
//
// Uso (via npm run, ver package.json):
//   db-remoto status              migrations aplicadas e pendentes no remoto
//   db-remoto migrar              aplica todas as pendentes, em ordem
//   db-remoto migrar <versão>     aplica só uma (ex.: 20261012130000, ou o nome do arquivo)
//   db-remoto marcar <versão>     registra como aplicada sem rodar (já foi aplicada à mão no painel)
//   db-remoto zerar               apaga o schema public e reaplica todas as migrations + admin
//   db-remoto seed:demo           carrega supabase/seeds/demo/*.sql (exige banco sem dados)
//   db-remoto sql "<sql>"         roda um SQL avulso e mostra o resultado
//
// Precisa de SUPABASE_ACCESS_TOKEN (token pessoal: supabase.com/dashboard/account/tokens) em
// .env.supabase.local. O projeto é o linkado (supabase/.temp/project-ref) ou SUPABASE_PROJECT_REF.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = join(RAIZ, "supabase", "migrations");
const SEED_ADMIN = join(RAIZ, "supabase", "seed.sql");
const SEEDS_DEMO = join(RAIZ, "supabase", "seeds", "demo");
const ADMIN_ID = "a0000000-0000-0000-0000-000000000001";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const refArquivo = join(RAIZ, "supabase", ".temp", "project-ref");
const ref =
  process.env.SUPABASE_PROJECT_REF ?? (existsSync(refArquivo) ? readFileSync(refArquivo, "utf8").trim() : null);

function sair(mensagem) {
  console.error(`\n✖ ${mensagem}`);
  process.exit(1);
}

if (!token) {
  sair(
    "Falta SUPABASE_ACCESS_TOKEN. Gere um token em https://supabase.com/dashboard/account/tokens e grave\n" +
      "  em .env.supabase.local:  SUPABASE_ACCESS_TOKEN=sbp_...",
  );
}
if (!ref) sair("Projeto não identificado: rode `npx supabase link` ou defina SUPABASE_PROJECT_REF.");

async function sql(query) {
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const texto = await resposta.text();
  if (!resposta.ok) {
    let detalhe = texto;
    try {
      detalhe = JSON.parse(texto).message ?? texto;
    } catch {}
    throw new Error(`HTTP ${resposta.status}: ${detalhe}`);
  }
  return texto ? JSON.parse(texto) : [];
}

const literal = (texto) => `'${texto.replace(/'/g, "''")}'`;

// histórico no mesmo formato do CLI: `supabase migration list`/`db push` continuam entendendo
const GARANTIR_HISTORICO = `
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  );`;

// o padrão do Supabase pro schema public; refeito depois de cada migration porque objetos criados
// por outro papel que não o postgres não herdam os default privileges
const GRANTS_PUBLIC = `
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant all on all routines in schema public to anon, authenticated, service_role;`;

function migrationsLocais() {
  return readdirSync(MIGRATIONS)
    .filter((arquivo) => /^\d{14}_.+\.sql$/.test(arquivo))
    .sort()
    .map((arquivo) => ({
      arquivo,
      versao: arquivo.slice(0, 14),
      nome: arquivo.slice(15, -4),
      caminho: join(MIGRATIONS, arquivo),
    }));
}

async function versoesAplicadas() {
  await sql(GARANTIR_HISTORICO);
  const linhas = await sql("select version from supabase_migrations.schema_migrations order by version");
  return new Set(linhas.map((linha) => linha.version));
}

function encontrarMigration(alvo) {
  const migration = migrationsLocais().find(
    (m) => m.versao === alvo || m.arquivo === basename(alvo) || m.nome === alvo,
  );
  if (!migration) sair(`Migration "${alvo}" não encontrada em supabase/migrations.`);
  return migration;
}

const registroNoHistorico = (migration, conteudo) =>
  `insert into supabase_migrations.schema_migrations (version, name, statements) ` +
  `values (${literal(migration.versao)}, ${literal(migration.nome)}, array[${literal(conteudo)}]);`;

// migration + registro no histórico num lote só: o Postgres roda um lote de comandos numa transação
// implícita, então se a migration falhar o registro também não entra
async function aplicarMigration(migration) {
  process.stdout.write(`  → ${migration.arquivo} ... `);
  const conteudo = readFileSync(migration.caminho, "utf8");
  await sql(`${conteudo}\n;\n${GRANTS_PUBLIC}\n${registroNoHistorico(migration, conteudo)}`);
  console.log("ok");
}

async function confirmar(pergunta, esperado) {
  if (process.argv.includes("--sim")) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = (await rl.question(`${pergunta}\nDigite "${esperado}" para continuar: `)).trim();
  rl.close();
  if (resposta !== esperado) sair("Cancelado.");
}

async function status() {
  const aplicadas = await versoesAplicadas();
  console.log(`Projeto ${ref}\n`);
  for (const migration of migrationsLocais()) {
    console.log(`  ${aplicadas.has(migration.versao) ? "✔ aplicada " : "• PENDENTE "} ${migration.arquivo}`);
  }
  const locais = new Set(migrationsLocais().map((m) => m.versao));
  for (const versao of aplicadas) {
    if (!locais.has(versao)) console.log(`  ? só no remoto ${versao} (sem arquivo local)`);
  }
}

async function migrar(alvo) {
  const aplicadas = await versoesAplicadas();
  const locais = migrationsLocais();

  if (alvo) {
    const migration = encontrarMigration(alvo);
    if (aplicadas.has(migration.versao)) sair(`${migration.arquivo} já está aplicada no remoto.`);
    console.log(`Aplicando 1 migration em ${ref}:`);
    await aplicarMigration(migration);
    return;
  }

  const pendentes = locais.filter((m) => !aplicadas.has(m.versao));
  if (pendentes.length === 0) {
    console.log("Nenhuma migration pendente.");
    return;
  }
  console.log(`Aplicando ${pendentes.length} migration(s) em ${ref}:`);
  for (const migration of pendentes) await aplicarMigration(migration);
}

async function marcar(alvo) {
  if (!alvo) sair("Informe a migration: npm run db:remoto:marcar -- 20261012130000");
  const migration = encontrarMigration(alvo);
  const aplicadas = await versoesAplicadas();
  if (aplicadas.has(migration.versao)) sair(`${migration.arquivo} já consta como aplicada.`);
  await sql(registroNoHistorico(migration, readFileSync(migration.caminho, "utf8")));
  console.log(`${migration.arquivo} registrada como aplicada (o SQL não foi executado).`);
}

async function zerar() {
  await confirmar(
    `\nIsto APAGA todos os dados do schema public do projeto ${ref} e reaplica as migrations.\n` +
      "Usuários de login (auth) são mantidos.",
    ref,
  );

  console.log("Apagando o schema public...");
  await sql(`
    ${GARANTIR_HISTORICO}
    do $$
    begin
      if exists (select 1 from pg_namespace where nspname = 'cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'atualizar-cotacao-bcv';
      end if;
    end;
    $$;
    drop schema if exists public cascade;
    create schema public;
    grant all on schema public to postgres;
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on routines to anon, authenticated, service_role;
    ${GRANTS_PUBLIC}
    truncate supabase_migrations.schema_migrations;`);

  console.log("Reaplicando as migrations:");
  for (const migration of migrationsLocais()) await aplicarMigration(migration);

  const [{ existe }] = await sql(`select exists (select 1 from auth.users where id = '${ADMIN_ID}') as existe`);
  if (existe) {
    console.log("Usuário admin já existe (auth não é apagado).");
  } else {
    process.stdout.write("Criando o usuário admin (supabase/seed.sql) ... ");
    await sql(readFileSync(SEED_ADMIN, "utf8"));
    console.log("ok");
  }
  console.log("\nBanco zerado. Para carregar a demo: npm run db:remoto:demo");
}

async function seedDemo() {
  const [{ total }] = await sql("select count(*)::int as total from proprietarios");
  if (total > 0) {
    sair(
      `O banco já tem ${total} proprietário(s): a demo usa IDs fixos e precisa de banco vazio.\n` +
        "  Rode antes: npm run db:remoto:zerar",
    );
  }
  const arquivos = readdirSync(SEEDS_DEMO).filter((arquivo) => arquivo.endsWith(".sql")).sort();
  console.log(`Carregando a demo em ${ref}:`);
  for (const arquivo of arquivos) {
    process.stdout.write(`  → ${arquivo} ... `);
    await sql(readFileSync(join(SEEDS_DEMO, arquivo), "utf8"));
    console.log("ok");
  }
}

const [comando, argumento] = process.argv.slice(2).filter((arg) => arg !== "--sim");
const comandos = {
  status: () => status(),
  migrar: () => migrar(argumento),
  marcar: () => marcar(argumento),
  zerar: () => zerar(),
  "seed:demo": () => seedDemo(),
  sql: async () => {
    if (!argumento) sair('Informe o SQL: npm run db:remoto:sql -- "select ..."');
    console.table(await sql(argumento));
  },
};

if (!comandos[comando]) sair(`Comando desconhecido: ${comando ?? "(nenhum)"}. Use: ${Object.keys(comandos).join(", ")}`);

try {
  await comandos[comando]();
} catch (erro) {
  sair(erro instanceof Error ? erro.message : String(erro));
}
