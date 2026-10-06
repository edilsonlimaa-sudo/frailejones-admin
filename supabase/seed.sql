-- Seed de desenvolvimento e teste: roda no `supabase db reset` local e no `db reset --linked` do
-- projeto remoto de teste. Roda depois de seeds/unidades.sql (ver [db.seed] em config.toml).
--
-- Só cria o usuário admin; taxas, cotações e créditos são cadastrados pelo app.
--
-- ATENÇÃO: a senha está no repositório. Quando o remoto virar produção de verdade, tire este
-- arquivo do [db.seed] e apague esse usuário lá.
--
-- Usuário admin de desenvolvimento:
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
