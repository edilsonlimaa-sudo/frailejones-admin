-- Seed do ambiente LOCAL (supabase start / supabase db reset). Nunca rode no projeto remoto.
-- Roda depois de snippets/seed_288_unidades.sql (ver [db.seed] em config.toml).
--
-- Só cria o usuário admin e a URL usada pelo cron da cotação BCV; taxas, cotações e créditos são
-- cadastrados pelo app.
--
-- Usuário admin de desenvolvimento (só existe no banco local):
--   e-mail: admin@frailejones.test
--   senha:  admin-local-123

-- ============================================================
-- USUÁRIO ADMIN (qualquer usuário autenticado acessa o painel)
-- ============================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'admin@frailejones.test',
  extensions.crypt('admin-local-123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  now(),
  now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "admin@frailejones.test"}',
  'email',
  now(),
  now(),
  now()
);

-- ============================================================
-- URL DO PROJETO PRO CRON DA COTAÇÃO BCV (ver migration agendar_atualizacao_cotacao_bcv)
-- kong é o gateway da API dentro da rede Docker do Supabase local
-- ============================================================
select vault.create_secret('http://kong:8000', 'project_url');
