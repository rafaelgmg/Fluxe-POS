-- ─────────────────────────────────────────────────────────────────────────────
-- migration_rls_fixes.sql
-- Fluxe POS — RLS Audit Fixes
--
-- Corrige 2 gaps encontrados na auditoria de segurança:
--
--   1. location_configs — tabela sem RLS (criada diretamente no Supabase)
--   2. customer_messages — policy usa auth.uid() em vez de auth_org_id()
--                          bloqueando a machine account silenciosamente
--
-- Execute no Supabase SQL Editor (service_role / postgres).
-- Seguro re-executar: DROP IF EXISTS antes de recriar cada policy.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- Fix 1: location_configs — habilitar RLS e criar policies
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A tabela armazena configurações estendidas por kiosk (tax_rate, min price
-- restriction, etc.) e é lida/gravada pelo app via supabaseWrite.js.
-- Sem RLS, a conta machine de qualquer tenant poderia ler as configs de outros.

ALTER TABLE location_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation_select" ON location_configs;
DROP POLICY IF EXISTS "org_isolation_insert" ON location_configs;
DROP POLICY IF EXISTS "org_isolation_update" ON location_configs;
DROP POLICY IF EXISTS "org_isolation_delete" ON location_configs;

CREATE POLICY "org_isolation_select" ON location_configs
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON location_configs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON location_configs
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE não esperado do client — service_role only.


-- ══════════════════════════════════════════════════════════════════════════════
-- Fix 2: customer_messages — corrigir policy que usa auth.uid() errado
-- ══════════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: migration_sms_phase1.sql criou policies com:
--   organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
--
-- auth.uid() retorna o UUID da conta machine no Supabase Auth.
-- Essa conta NÃO tem entrada na tabela `users` (que armazena funcionários).
-- Resultado: a machine account não consegue ler nem inserir mensagens —
-- qualquer chamada ao endpoint /customer_messages retorna vazio ou 403.
--
-- CORREÇÃO: usar auth_org_id() — mesma função usada em todas as outras tabelas.

DROP POLICY IF EXISTS "org_members_read_messages"   ON customer_messages;
DROP POLICY IF EXISTS "org_members_insert_messages" ON customer_messages;

CREATE POLICY "org_isolation_select" ON customer_messages
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON customer_messages
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

-- UPDATE para marcar status (sent, delivered, failed) — feito pelo servidor Express
-- via service_role, então não precisa de policy client-side para UPDATE.


-- ══════════════════════════════════════════════════════════════════════════════
-- Verificação — rode após aplicar
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Confirmar que RLS está ativo nas duas tabelas:
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('location_configs', 'customer_messages')
ORDER BY tablename;
-- Esperado: rls_enabled = true para as duas.

-- 2. Listar todas as policies das duas tabelas:
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('location_configs', 'customer_messages')
ORDER BY tablename, cmd;
-- Esperado: location_configs com 3 policies (SELECT/INSERT/UPDATE)
--           customer_messages com 2 policies (SELECT/INSERT) usando auth_org_id()

-- 3. Confirmar que as policies antigas (auth.uid()) foram removidas:
SELECT policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'customer_messages'
  AND policyname IN ('org_members_read_messages', 'org_members_insert_messages');
-- Esperado: 0 linhas (foram removidas).
