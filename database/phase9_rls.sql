-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 9: Row Level Security
-- Fluxe POS — multi-tenant isolation via Supabase Auth JWT claims
--
-- Tabelas cobertas (14):
--   organizations · locations · users · user_location_access
--   categories · products · inventory_stock
--   sales · sale_items · payments · inventory_movements
--   clock_records · inventory_transfers · customers
--
-- ── PRÉ-REQUISITOS (execute ANTES deste arquivo) ─────────────────────────────
--
--  1. Criar a conta machine no Supabase Auth:
--       Dashboard → Authentication → Users → Add user
--       Email:    pos-machine@perfumepassage.local
--       Password: <senha forte aleatória>
--
--  2. Injetar org_id no app_metadata da conta machine:
--
--       UPDATE auth.users
--       SET    raw_app_meta_data = raw_app_meta_data
--                               || '{"org_id": "<ORG_UUID>"}'::jsonb
--       WHERE  email = 'pos-machine@perfumepassage.local';
--
--       Verificar:
--       SELECT raw_app_meta_data FROM auth.users
--       WHERE  email = 'pos-machine@perfumepassage.local';
--       -- Esperado: {"provider": "email", "providers": ["email"], "org_id": "<ORG_UUID>"}
--
--  3. Adicionar ao .env (VITE_SUPABASE_ORG_ID torna-se OBRIGATÓRIO):
--
--       VITE_ORG_MACHINE_EMAIL=pos-machine@perfumepassage.local
--       VITE_ORG_MACHINE_PASSWORD=<senha-do-passo-1>
--       VITE_SUPABASE_ORG_ID=<org-uuid>
--
--  4. Deploy do frontend com VITE_SUPABASE_ORG_ID definido.
--     Testar que o app abre, dados aparecem e PIN funciona.
--     SÓ DEPOIS executar este SQL.
--
-- ── ORDEM DE APLICAÇÃO ───────────────────────────────────────────────────────
--  Execute Steps 1 → 5 em sequência na mesma sessão do SQL Editor.
--
-- ── RISCO DE ATOMICIDADE ─────────────────────────────────────────────────────
--  Se executar Step 2 sem o Step 4, TODAS as leituras authenticated/anon
--  são bloqueadas imediatamente. Execute Steps 2–4 sem interrupção.
--
-- ── service_role bypass ──────────────────────────────────────────────────────
--  A chave service_role sempre bypassa RLS. Migrations e operações admin
--  via service_role não são afetadas por estas policies.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 1: Helper auth_org_id() + GRANT no RPC de PIN
-- ═══════════════════════════════════════════════════════════════════════════

-- Extrai org_id do JWT app_metadata da conta machine.
-- Retorna NULL para anon (sem JWT) ou JWT sem app_metadata.org_id.
-- Não precisa de SECURITY DEFINER — auth.jwt() é acessível a todos os roles.

CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'org_id',
      ''
    ),
    ''
  )::UUID
$$;

GRANT EXECUTE ON FUNCTION auth_org_id() TO authenticated, anon;

-- verify_employee_pin é SECURITY DEFINER (bypassa RLS para ler users.pin).
-- Precisa ser callable pelo role anon para o fallback offline funcionar
-- (quando initOrgSession() ainda não completou, o app usa a anon key).
GRANT EXECUTE ON FUNCTION verify_employee_pin(uuid, text, text) TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 2: Habilitar RLS em todas as tabelas
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY é idempotente — seguro re-executar)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clock_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 3: Remover policies existentes (slate limpo antes de recriar)
-- ═══════════════════════════════════════════════════════════════════════════

-- organizations
DROP POLICY IF EXISTS "org_select"           ON organizations;

-- locations
DROP POLICY IF EXISTS "org_isolation_select" ON locations;
DROP POLICY IF EXISTS "org_isolation_insert" ON locations;
DROP POLICY IF EXISTS "org_isolation_update" ON locations;
DROP POLICY IF EXISTS "org_isolation_delete" ON locations;

-- users
DROP POLICY IF EXISTS "org_isolation_select" ON users;
DROP POLICY IF EXISTS "org_isolation_insert" ON users;
DROP POLICY IF EXISTS "org_isolation_update" ON users;
DROP POLICY IF EXISTS "org_isolation_delete" ON users;

-- user_location_access
DROP POLICY IF EXISTS "org_isolation_select" ON user_location_access;
DROP POLICY IF EXISTS "org_isolation_insert" ON user_location_access;
DROP POLICY IF EXISTS "org_isolation_delete" ON user_location_access;

-- categories
DROP POLICY IF EXISTS "org_isolation_select" ON categories;
DROP POLICY IF EXISTS "org_isolation_insert" ON categories;
DROP POLICY IF EXISTS "org_isolation_update" ON categories;
DROP POLICY IF EXISTS "org_isolation_delete" ON categories;

-- products
DROP POLICY IF EXISTS "org_isolation_select" ON products;
DROP POLICY IF EXISTS "org_isolation_insert" ON products;
DROP POLICY IF EXISTS "org_isolation_update" ON products;
DROP POLICY IF EXISTS "org_isolation_delete" ON products;

-- inventory_stock
DROP POLICY IF EXISTS "org_isolation_select" ON inventory_stock;
DROP POLICY IF EXISTS "org_isolation_insert" ON inventory_stock;
DROP POLICY IF EXISTS "org_isolation_update" ON inventory_stock;
DROP POLICY IF EXISTS "org_isolation_delete" ON inventory_stock;

-- sales
DROP POLICY IF EXISTS "org_isolation_select" ON sales;
DROP POLICY IF EXISTS "org_isolation_insert" ON sales;
DROP POLICY IF EXISTS "org_isolation_update" ON sales;

-- sale_items
DROP POLICY IF EXISTS "org_isolation_select" ON sale_items;
DROP POLICY IF EXISTS "org_isolation_insert" ON sale_items;

-- payments
DROP POLICY IF EXISTS "org_isolation_select" ON payments;
DROP POLICY IF EXISTS "org_isolation_insert" ON payments;

-- inventory_movements
DROP POLICY IF EXISTS "org_isolation_select" ON inventory_movements;
DROP POLICY IF EXISTS "org_isolation_insert" ON inventory_movements;

-- clock_records
DROP POLICY IF EXISTS "org_isolation_select" ON clock_records;
DROP POLICY IF EXISTS "org_isolation_insert" ON clock_records;
DROP POLICY IF EXISTS "org_isolation_update" ON clock_records;
DROP POLICY IF EXISTS "org_isolation_delete" ON clock_records;

-- inventory_transfers
DROP POLICY IF EXISTS "org_isolation_select" ON inventory_transfers;
DROP POLICY IF EXISTS "org_isolation_insert" ON inventory_transfers;
DROP POLICY IF EXISTS "org_isolation_update" ON inventory_transfers;

-- customers
DROP POLICY IF EXISTS "org_isolation_select" ON customers;
DROP POLICY IF EXISTS "org_isolation_insert" ON customers;
DROP POLICY IF EXISTS "org_isolation_update" ON customers;
DROP POLICY IF EXISTS "org_isolation_delete" ON customers;


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 4: Criar policies RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Estratégia uniforme: organization_id = auth_org_id()
-- auth_org_id() retorna NULL para anon → nenhuma row é visível para anon.
-- Apenas a conta machine (authenticated com org_id no JWT) acessa os dados.


-- ── organizations ─────────────────────────────────────────────────────────────
-- Um tenant vê apenas sua própria row. INSERT/UPDATE/DELETE = service_role only.

CREATE POLICY "org_select" ON organizations
  FOR SELECT TO authenticated
  USING (id = auth_org_id());


-- ── locations ─────────────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON locations
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON locations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON locations
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE em locations: não esperado do client — service_role only.


-- ── users ─────────────────────────────────────────────────────────────────────
-- ATENÇÃO: SELECT inclui a coluna pin.
--   · A função verify_employee_pin() (SECURITY DEFINER) faz a comparação no banco.
--   · O app client-side nunca recebe pin via fetchUsers() — fromSupabaseUser() o remove.
--   · Para proteção completa no banco, criar uma view v_users sem a coluna pin
--     e revogar SELECT direta na tabela (melhoria futura, não bloqueante).

CREATE POLICY "org_isolation_select" ON users
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON users
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON users
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE: app só desativa (status='inactive'), não hard delete.
-- Usar service_role para deleção admin.


-- ── user_location_access ──────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON user_location_access
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON user_location_access
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

-- DELETE: cascade a partir de users/locations. DELETE direto não esperado.


-- ── categories ────────────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON categories
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON categories
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_delete" ON categories
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());


-- ── products ──────────────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON products
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON products
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON products
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_delete" ON products
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());


-- ── inventory_stock ───────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON inventory_stock
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON inventory_stock
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

-- UPDATE: atualizado a cada venda e ajuste de estoque.
CREATE POLICY "org_isolation_update" ON inventory_stock
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE: cascade de products/locations. Não esperado do client.


-- ── sales ─────────────────────────────────────────────────────────────────────
-- UPDATE permitido apenas para anulação de venda (status = 'voided').
-- DELETE bloqueado — sales são ledger imutável.

CREATE POLICY "org_isolation_select" ON sales
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON sales
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());


-- ── sale_items ────────────────────────────────────────────────────────────────
-- Sem coluna organization_id — isolamento via FK para sales.
-- Subquery correlacionada: eficiente com o índice idx_sale_items_sale.

CREATE POLICY "org_isolation_select" ON sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = sale_items.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

CREATE POLICY "org_isolation_insert" ON sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = sale_items.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

-- UPDATE/DELETE: sale_items são imutáveis após INSERT.


-- ── payments ──────────────────────────────────────────────────────────────────
-- Mesmo padrão de sale_items.

CREATE POLICY "org_isolation_select" ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = payments.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

CREATE POLICY "org_isolation_insert" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = payments.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

-- UPDATE/DELETE: payments são imutáveis após INSERT.


-- ── inventory_movements ───────────────────────────────────────────────────────
-- Ledger imutável — INSERT permitido, UPDATE/DELETE bloqueados.

CREATE POLICY "org_isolation_select" ON inventory_movements
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());


-- ── clock_records ─────────────────────────────────────────────────────────────
-- UPDATE permitido: clock_out é preenchido quando o funcionário sai.
-- DELETE não esperado do client (soft-delete via status, ou service_role).

CREATE POLICY "org_isolation_select" ON clock_records
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON clock_records
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON clock_records
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());


-- ── inventory_transfers ───────────────────────────────────────────────────────
-- UPDATE permitido: receiveTransfer() atualiza status e received_at.
-- DELETE não esperado do client.

CREATE POLICY "org_isolation_select" ON inventory_transfers
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON inventory_transfers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON inventory_transfers
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());


-- ── customers ─────────────────────────────────────────────────────────────────
-- Soft-delete preferido (archived=true). Hard DELETE via service_role only.

CREATE POLICY "org_isolation_select" ON customers
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON customers
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_delete" ON customers
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 5: Validação
-- ═══════════════════════════════════════════════════════════════════════════

-- 5a. Listar todas as policies criadas (esperado: ~32 rows)
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 5b. Verificar que RLS está habilitado em todas as tabelas esperadas
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'locations', 'users', 'user_location_access',
    'categories', 'products', 'inventory_stock',
    'sales', 'sale_items', 'payments', 'inventory_movements',
    'clock_records', 'inventory_transfers', 'customers'
  )
ORDER BY tablename;
-- Esperado: rls_enabled = true para todas as 14 tabelas.

-- 5c. Testar isolamento com JWT simulado
-- (Executar como postgres/service_role no SQL Editor):
--
-- SET LOCAL request.jwt.claims = '{"sub":"machine","role":"authenticated","app_metadata":{"org_id":"<SEU_ORG_UUID>"}}';
-- SELECT COUNT(*) FROM sales;        -- deve retornar sua contagem real
-- SELECT COUNT(*) FROM products;     -- deve retornar sua contagem real
-- SELECT COUNT(*) FROM clock_records;-- deve retornar sua contagem real
--
-- SET LOCAL request.jwt.claims = '{"sub":"outro","role":"authenticated","app_metadata":{"org_id":"00000000-0000-0000-0000-000000000000"}}';
-- SELECT COUNT(*) FROM sales;        -- deve retornar 0 (org inexistente)
-- SELECT COUNT(*) FROM products;     -- deve retornar 0
--
-- SET LOCAL request.jwt.claims = '{"sub":"anon","role":"anon"}';
-- SELECT COUNT(*) FROM sales;        -- deve retornar 0 (anon bloqueado)

-- 5d. Verificar que verify_employee_pin ainda funciona após RLS
-- (Chamar pelo app — o RPC é SECURITY DEFINER, bypassa RLS)


-- ─────────────────────────────────────────────────────────────────────────────
-- Riscos conhecidos e melhorias futuras
--
-- 1. users.pin visível para authenticated:
--    Com RLS ativo, a conta machine (authenticated) ainda pode ler a coluna pin.
--    Mitigação atual: fromSupabaseUser() remove pin antes de retornar ao client.
--    Mitigação futura: criar view v_users sem a coluna pin + REVOKE SELECT na
--    tabela base + GRANT SELECT na view. Não bloqueante para o go-live.
--
-- 2. sale_items / payments sem organization_id:
--    Isolamento via subquery correlated (EXISTS SELECT 1 FROM sales ...).
--    Correto e eficiente para volume de kiosk (milhares, não milhões de rows).
--    Melhoria futura: adicionar organization_id nas duas tabelas para
--    policy direta (evita o JOIN). Requer migration de dados.
--
-- 3. Isolamento por location (não implementado):
--    A conta machine é org-level, não location-level.
--    Ambos os kiosks usam o mesmo JWT com o mesmo org_id.
--    O filtro por location é feito client-side (e.g. &location_name=eq.X).
--    Para isolamento por location no banco, seria necessário um JWT por kiosk
--    e policies com location_id na claim — complexidade alta, benefício baixo
--    para um negócio de 2 kiosks com o mesmo dono.
--
-- 4. Expiração do token:
--    O JWT da conta machine expira (padrão 1h no Supabase).
--    O frontend agenda refresh automático 2min antes do vencimento.
--    Se o refresh falhar, o app cai para localStorage até o próximo restart.
--    Monitorar o console para '[Fluxe] Token refresh failed'.
--
-- 5. verify_employee_pin ainda usa pin texto puro:
--    A migração para bcrypt (phase6_pin_hash.sql) é separada desta.
--    RLS protege contra leitura direta da tabela users via REST API.
--    A comparação plaintext dentro do RPC SECURITY DEFINER é aceitável
--    para go-live, mas deve ser migrada para bcrypt antes de escalar.
-- ─────────────────────────────────────────────────────────────────────────────
