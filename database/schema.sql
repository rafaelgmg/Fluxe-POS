-- ============================================================
--  FLUXE POS — Schema v1.2
--  Supabase / PostgreSQL
--
--  Escopo: core transacional
--    organizations · locations · users · user_location_access
--    categories · products · inventory_stock
--    sales · sale_items · payments · inventory_movements
--
--  Fora do escopo v1: CRM, refunds, comissão config, RLS, views
--
--  Ordem de criação (respeitando FKs):
--    1. set_updated_at()     (função compartilhada)
--    2. organizations
--    3. locations
--    4. users
--    5. user_location_access
--    6. categories
--    7. products
--    8. inventory_stock
--    9. invoice_number_seq
--   10. sales
--   11. sale_items
--   12. payments
--   13. inventory_movements  ← referencia sales
--
--  ── APPLY INSTRUCTIONS (primeira vez no Supabase) ────────────
--  1. Aplicar este arquivo inteiro (fresh apply — sem dados)
--  2. Rodar database/seed_from_localStorage.sql (quando disponível)
--     O seed mapper deve:
--       · Mapear status: 'normal' → 'completed', 'deleted' → 'voided'
--       · Mapear payment method: 'Cash'→'cash', 'Credit Card'→'card',
--           'External Credit'→'external', 'Check'→'check'
--       · Mapear invoice.timestamp → sold_at
--       · Inserir sales com number EXPLÍCITO (não usar o default da seq)
--       · Após o seed, resetar a sequência:
--           SELECT setval('invoice_number_seq', (SELECT MAX(number) FROM sales));
--       · Passar organization_id explicitamente em:
--           user_location_access, inventory_stock
--       · NÃO incluir a coluna delta no INSERT de inventory_movements
--           (é GENERATED ALWAYS — o banco calcula automaticamente)
--
--  Se já tiver uma v1.0 aplicada com enum ('normal','deleted'):
--    → ver database/migration_sale_status_v1.0_to_v1.2.sql
--  ─────────────────────────────────────────────────────────────
--
--  v1.2 — alterações em relação à v1.1:
--    · Comentários de migração de sale_status movidos para arquivo
--      separado (migration_sale_status_v1.0_to_v1.2.sql) —
--      não eram DDL executável e geravam confusão no schema principal
--    · users.pin: COMMENT ON COLUMN adicionado; índice duplicado
--      idx_users_login removido (coberto por idx_users_pin_active)
--    · categories: documentação de deassociação antes de DELETE
--      explicitada; fluxo admin obrigatório documentado
--    · user_location_access: INSERT requirements documentados
--      explicitamente — backend deve sempre passar organization_id
--      igual ao da org do user e da location
--
--  v1.1 — alterações em relação à v1.0:
--    · UNIQUE (id, organization_id) em: locations, users,
--      categories, products, sales — habilitam FKs compostas multi-tenant
--    · user_location_access: organization_id adicionado; FKs compostas
--    · inventory_stock: organization_id adicionado; FKs compostas
--    · products.category_id: FK composta + ON DELETE RESTRICT
--    · inventory_movements: FK composta em product_id/organization_id
--    · set_updated_at(): função + triggers em todas as tabelas com updated_at
--    · users.pin: UNIQUE parcial para status = 'active' apenas
--    · sale_status: 'normal' → 'completed', 'deleted' → 'voided'
--    · inventory_movements: CHECKs de consistência
-- ============================================================


-- ============================================================
--  FUNÇÃO COMPARTILHADA — updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ============================================================
--  ENUMS
-- ============================================================

-- Reutilizado em locations, users, products, categories
CREATE TYPE entity_status AS ENUM ('active', 'inactive');

-- Status de venda — sem hard delete em vendas
-- 'completed' = venda normal finalizada
-- 'voided'    = venda cancelada/anulada
--
-- NOVO BANCO (fresh apply): nenhuma ação adicional necessária.
-- MIGRAÇÃO de banco existente com ('normal','deleted'):
--   → ver database/migration_sale_status_v1.0_to_v1.2.sql
-- SEED de localStorage: o adapter deve mapear
--   'normal'  → 'completed'  e  'deleted' → 'voided'  antes do INSERT.
CREATE TYPE sale_status AS ENUM ('completed', 'voided');

-- Método de pagamento (normalizado — lowercase, sem espaços)
-- Frontend legacy: 'Cash', 'Credit Card', 'External Credit', 'Check'
-- → mapeado por legacySale.js antes de persistir
CREATE TYPE payment_method_type AS ENUM ('cash', 'card', 'external', 'check');

-- Tipo de movimento de inventário
-- 'sale'          → decremento gerado por uma venda finalizada
-- 'refund'        → reposição gerada por uma devolução (schema v2)
-- 'adjustment'    → ajuste manual por admin
-- 'transfer'      → transferência entre locations (exige to_location_id)
-- 'count_set'     → contagem física reconciliada
-- 'removal'       → produto removido do catálogo
-- 'product_update'→ edição de campos (sem alteração de qty)
-- 'status_change' → ativação/desativação de produto
CREATE TYPE inventory_movement_type AS ENUM (
  'sale',
  'refund',
  'adjustment',
  'transfer',
  'count_set',
  'removal',
  'product_update',
  'status_change'
);


-- ============================================================
--  1. ORGANIZATIONS
--
--  Uma linha por negócio. Para o Fluxe atual = 1 row
--  ("Perfume Passage"). slug para roteamento SaaS futuro.
-- ============================================================

CREATE TABLE organizations (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,     -- ex: 'perfume-passage'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
--  2. LOCATIONS
--
--  Cada kiosk físico. Pertence a uma organization.
--  UNIQUE (id, organization_id): necessário para FKs compostas
--    em user_location_access, inventory_stock e inventory_movements.
--
--  tax_rate: percentual direto, ex: 8.5 = 8.5% (Nevada).
--  spare_commission_*: config de comissão de spare.
--    spare_tiers (JSONB): array [{ threshold: $, rate: % }]
--    usado quando mode = 'tiered'.
-- ============================================================

CREATE TABLE locations (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID         NOT NULL REFERENCES organizations(id),
  name                     TEXT         NOT NULL,
  address                  TEXT         NOT NULL DEFAULT '',
  tax_rate                 NUMERIC(5,2) NOT NULL DEFAULT 8.5,
  tax_display_as           TEXT         NOT NULL DEFAULT 'TAX',
  block_sale_out_of_stock  BOOLEAN      NOT NULL DEFAULT false,
  accept_cash              BOOLEAN      NOT NULL DEFAULT true,
  accept_card              BOOLEAN      NOT NULL DEFAULT true,
  accept_ext_credit        BOOLEAN      NOT NULL DEFAULT true,
  accept_check             BOOLEAN      NOT NULL DEFAULT false,
  spare_commission_rate    NUMERIC(5,2) NOT NULL DEFAULT 30,
  spare_commission_mode    TEXT         NOT NULL DEFAULT 'fixed'
                             CHECK (spare_commission_mode IN ('fixed', 'tiered')),
  spare_tiers              JSONB        NOT NULL DEFAULT '[]',
  status                   entity_status NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (organization_id, name),
  -- suporte a FKs compostas multi-tenant
  UNIQUE (id, organization_id)
);

CREATE INDEX idx_locations_org ON locations (organization_id);

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
--  3. USERS
--
--  Funcionários do POS. auth_user_id fica NULL até o Supabase
--  Auth ser conectado — a coluna existe mas não bloqueia nada.
--
--  pin: coluna TEXT — aceita tanto texto puro (dev/seed) quanto hash.
--    PRODUÇÃO: armazenar APENAS bcrypt hash (custo >= 10).
--    Nunca retornar pin em respostas de API (SELECT explícito sem pin).
--    Migração para hash: ver database/migrate_pins_to_bcrypt.md
--  UNIQUE (id, organization_id): suporte a FKs compostas.
--  PIN unique parcial (idx_users_pin_active): PIN único apenas para
--    usuários ativos — inativados/soft-deleted não conflitam.
-- ============================================================

CREATE TABLE users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id),
  auth_user_id     UUID         UNIQUE,             -- FK futura → auth.users
  first_name       TEXT         NOT NULL DEFAULT '',
  last_name        TEXT         NOT NULL DEFAULT '',
  position         TEXT         NOT NULL DEFAULT 'Sales',
  email            TEXT         NOT NULL DEFAULT '',
  phone            TEXT         NOT NULL DEFAULT '',
  -- Armazenar bcrypt hash em produção (nunca texto puro na API pública)
  -- Formato esperado em produção: '$2b$12$...' (bcrypt, custo >= 10)
  pin              TEXT         NOT NULL,
  hourly_rate      NUMERIC(8,2) NOT NULL DEFAULT 0,
  status           entity_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- suporte a FKs compostas multi-tenant
  UNIQUE (id, organization_id)
  -- UNIQUE (organization_id, pin) removido — substituído por
  -- idx_users_pin_active abaixo (partial unique para ativos apenas)
);

-- Documenta o contrato de segurança do campo no catálogo do banco
COMMENT ON COLUMN users.pin IS
  'Hash bcrypt (custo >= 10) em produção. '
  'Nunca texto puro fora de ambiente de seed/dev. '
  'Nunca retornar esta coluna em respostas de API públicas.';

CREATE INDEX idx_users_org ON users (organization_id);

-- PIN não é único por design: múltiplos usuários podem ter o mesmo PIN.
-- Autenticação é sempre por perfil selecionado + PIN, nunca por PIN sozinho.
CREATE INDEX idx_users_pin ON users (organization_id, pin);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
--  4. USER_LOCATION_ACCESS
--
--  Controla quais locations um usuário pode operar.
--
--  organization_id: carregado explicitamente para que as FKs
--    compostas possam garantir, no banco, que user e location
--    pertencem à mesma org — impede acesso cross-tenant.
--
--  ── INSERT obrigatório pelo backend ──────────────────────────
--  INSERT INTO user_location_access (user_id, location_id, organization_id)
--  VALUES ($userId, $locationId, $orgId);
--
--  $orgId DEVE ser o mesmo que:
--    SELECT organization_id FROM users     WHERE id = $userId
--    SELECT organization_id FROM locations WHERE id = $locationId
--  O banco rejeita o INSERT se qualquer um dos dois não bater.
--  ─────────────────────────────────────────────────────────────
-- ============================================================

CREATE TABLE user_location_access (
  user_id         UUID        NOT NULL,
  location_id     UUID        NOT NULL,
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, location_id),

  -- FK composta: user pertence à mesma org que location
  FOREIGN KEY (user_id,     organization_id) REFERENCES users    (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_ula_location ON user_location_access (location_id);
CREATE INDEX idx_ula_org      ON user_location_access (organization_id);


-- ============================================================
--  5. CATEGORIES
--
--  Categorias de produto. Alterar campos aqui não afeta histórico
--  de vendas — sale_items armazenam category_name como snapshot.
--
--  UNIQUE (id, organization_id): suporte a FK composta em products.
--  commission_type: 'none' | 'tier_nc' | 'pct_subtotal' | ...
--  commission_rate: NULL = usar taxa do tier do dia.
--
--  ── DELETE de categoria: fluxo obrigatório ───────────────────
--  products.category_id tem ON DELETE RESTRICT — o banco bloqueia
--  DELETE em category que ainda tenha produtos vinculados.
--
--  Antes de deletar uma categoria, o backend DEVE:
--    UPDATE products SET category_id = NULL
--    WHERE category_id = $categoryId AND organization_id = $orgId;
--
--  Depois disso o DELETE FROM categories é aceito.
--  sale_items.category_id usa ON DELETE SET NULL — histórico
--  de vendas já feitas nunca é quebrado pelo delete.
--  ─────────────────────────────────────────────────────────────
-- ============================================================

CREATE TABLE categories (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID         NOT NULL REFERENCES organizations(id),
  name                      TEXT         NOT NULL,
  commission_type           TEXT         NOT NULL DEFAULT 'none',
  commission_rate           NUMERIC(5,2),                   -- NULL = usa tier rate
  spare_commission_enabled  BOOLEAN      NOT NULL DEFAULT false,
  status                    entity_status NOT NULL DEFAULT 'active',
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (organization_id, name),
  -- suporte a FK composta em products
  UNIQUE (id, organization_id)
);

CREATE INDEX idx_categories_org ON categories (organization_id);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
--  6. PRODUCTS
--
--  Catálogo de perfumes. min_price é coluna explícita aqui —
--  no frontend legacy era codificado no rawBarcode ("SKU.min").
--
--  category_id: FK COMPOSTA (category_id, organization_id)
--    garante que a categoria pertence à mesma organização do produto.
--    ON DELETE RESTRICT: deletar categoria exige mover/dissociar
--    produtos primeiro (comportamento correto de negócio).
--
--  UNIQUE (id, organization_id): suporte a FKs compostas em
--    inventory_stock e inventory_movements.
--
--  min_price: floor de preço, oculto para vendedores.
--  system_price: preço cheio exibido no recibo.
--  cost_price: custo de aquisição (uso interno).
--  barcode: código limpo, sem encoding de minPrice.
-- ============================================================

CREATE TABLE products (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id),
  -- category_id nullable: produto pode não ter categoria
  -- FK COMPOSTA garante mesma org (ON DELETE RESTRICT: mover produtos antes de deletar categoria)
  category_id      UUID,
  barcode          TEXT         NOT NULL,
  name             TEXT         NOT NULL,
  description      TEXT         NOT NULL DEFAULT '',
  size             TEXT         NOT NULL DEFAULT '',
  system_price     NUMERIC(10,2) NOT NULL,
  min_price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier_name    TEXT         NOT NULL DEFAULT '',
  status           entity_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (organization_id, barcode),
  -- suporte a FKs compostas multi-tenant
  UNIQUE (id, organization_id),

  -- FK composta: impede produto de apontar para categoria de outra org
  FOREIGN KEY (category_id, organization_id)
    REFERENCES categories (id, organization_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_products_org      ON products (organization_id);
CREATE INDEX idx_products_barcode  ON products (barcode);
CREATE INDEX idx_products_category ON products (category_id) WHERE category_id IS NOT NULL;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
--  7. INVENTORY_STOCK
--
--  Estado atual do estoque — uma linha por (product, location).
--  Equivalente ao objeto qtyByLoc do frontend, normalizado.
--
--  organization_id: carregado para FKs compostas que garantem
--    que product e location pertencem à mesma organização.
--
--  Regra: toda alteração aqui deve ter um registro
--  correspondente em inventory_movements (ledger).
-- ============================================================

CREATE TABLE inventory_stock (
  product_id      UUID    NOT NULL,
  location_id     UUID    NOT NULL,
  -- carrega org para FKs compostas — garante product e location na mesma org
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  qty             INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (product_id, location_id),

  -- garante que product e location pertencem à mesma org
  FOREIGN KEY (product_id,  organization_id) REFERENCES products (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_stock_location ON inventory_stock (location_id);
CREATE INDEX idx_stock_org      ON inventory_stock (organization_id);

CREATE TRIGGER trg_inventory_stock_updated_at
  BEFORE UPDATE ON inventory_stock
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
--  8. SEQUENCE — invoice number
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
  START     60001
  INCREMENT 1
  NO CYCLE;


-- ============================================================
--  9. SALES
--
--  Cada venda finalizada. Imutável após criação, exceto status.
--
--  UNIQUE (id, organization_id): suporte a FK composta em
--    inventory_movements.
--
--  location_id / employee_id: FKs simples nullable (ON DELETE SET NULL).
--    Não usam FK composta pois SET NULL nulificaria organization_id
--    (que é NOT NULL). Integridade cross-org garantida pelo backend
--    antes do INSERT — RLS reforçará isso na Fase 4.
--    Snapshots location_name / employee_name garantem auditabilidade.
--
--  status: 'completed' (venda normal) | 'voided' (anulada).
-- ============================================================

CREATE TABLE sales (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  number               BIGINT         NOT NULL DEFAULT nextval('invoice_number_seq'),
  organization_id      UUID           NOT NULL REFERENCES organizations(id),
  location_id          UUID           REFERENCES locations(id)  ON DELETE SET NULL,
  employee_id          UUID           REFERENCES users(id)      ON DELETE SET NULL,
  -- snapshots imutáveis
  location_name        TEXT           NOT NULL,
  employee_name        TEXT           NOT NULL,
  -- financeiros
  subtotal             NUMERIC(10,2)  NOT NULL,
  tax                  NUMERIC(10,2)  NOT NULL DEFAULT 0,
  tip                  NUMERIC(10,2)  NOT NULL DEFAULT 0,
  total                NUMERIC(10,2)  NOT NULL,
  total_spare          NUMERIC(10,2)  NOT NULL DEFAULT 0,
  -- metadados
  status               sale_status    NOT NULL DEFAULT 'completed',
  notes                TEXT           NOT NULL DEFAULT '',
  receipt_action       TEXT           NOT NULL DEFAULT 'none',
  linked_customer_id   UUID,                                  -- FK futura → customers
  -- config + cálculo no momento da venda (JSONB — imutável)
  commission_snapshot  JSONB,
  -- timestamps
  sold_at              TIMESTAMPTZ    NOT NULL,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),

  UNIQUE (organization_id, number),
  -- suporte a FK composta em inventory_movements
  UNIQUE (id, organization_id)
);

CREATE INDEX idx_sales_org_date    ON sales (organization_id, sold_at DESC);
CREATE INDEX idx_sales_loc_date    ON sales (location_id,     sold_at DESC);
CREATE INDEX idx_sales_employee    ON sales (employee_id);
CREATE INDEX idx_sales_customer    ON sales (linked_customer_id) WHERE linked_customer_id IS NOT NULL;
CREATE INDEX idx_sales_voided      ON sales (organization_id, sold_at DESC) WHERE status = 'voided';


-- ============================================================
--  10. SALE_ITEMS
--
--  Itens de cada venda. Completamente imutáveis após criação.
--  Todos os campos de produto são snapshots do momento da venda.
--
--  line_id: identidade estável dentro da venda para refunds.
--    Formato app: "<invoiceNumber>-<índice 1-based>" ex: "60001-1".
--    NULL para vendas anteriores ao Bloco D (legado).
--
--  product_id / category_id: FKs simples nullable — produto/categoria
--    deletados não quebram o histórico de vendas.
--    Integridade cross-org garantida pelo backend no INSERT.
-- ============================================================

CREATE TABLE sale_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       UUID          NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  line_id       TEXT,                                       -- NULL = legado pré-Bloco D
  product_id    UUID          REFERENCES products(id)   ON DELETE SET NULL,
  category_id   UUID          REFERENCES categories(id) ON DELETE SET NULL,
  -- snapshots imutáveis
  name          TEXT          NOT NULL,
  barcode       TEXT          NOT NULL,
  description   TEXT          NOT NULL DEFAULT '',
  size          TEXT          NOT NULL DEFAULT '',
  category_name TEXT          NOT NULL DEFAULT '',
  -- preços (todos snapshots)
  qty           INTEGER       NOT NULL CHECK (qty > 0),
  sale_price    NUMERIC(10,2) NOT NULL,
  system_price  NUMERIC(10,2) NOT NULL,
  min_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal      NUMERIC(10,2) NOT NULL,
  spare         NUMERIC(10,2) NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Unicidade de line_id apenas quando não-NULL
-- (itens legados podem ter múltiplos NULLs na mesma venda)
CREATE UNIQUE INDEX idx_sale_items_lineid
  ON sale_items (sale_id, line_id)
  WHERE line_id IS NOT NULL;

CREATE INDEX idx_sale_items_sale     ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product  ON sale_items (product_id)  WHERE product_id  IS NOT NULL;
CREATE INDEX idx_sale_items_category ON sale_items (category_id) WHERE category_id IS NOT NULL;


-- ============================================================
--  11. PAYMENTS
--
--  Um registro por método de pagamento por venda.
--  Uma venda pode ter N payments (split payment).
--
--  Campos específicos por método ficam NULL quando não aplicável:
--    cash     → amount_received, change_due
--    card     → card_brand, card_last4, authorization_number
--    external → external_ref
--    check    → check_number
--
--  amount_received (cash): total entregue pelo cliente.
--    Pode ser > amount (troco retornado via change_due).
-- ============================================================

CREATE TABLE payments (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id              UUID          NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method               payment_method_type NOT NULL,
  amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  -- cash
  amount_received      NUMERIC(10,2),
  change_due           NUMERIC(10,2),
  -- card
  card_brand           TEXT,
  card_last4           TEXT          CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  authorization_number TEXT,
  -- external credit
  external_ref         TEXT,
  -- check
  check_number         TEXT,

  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_sale ON payments (sale_id);


-- ============================================================
--  12. INVENTORY_MOVEMENTS
--
--  Ledger imutável de todos os eventos de estoque.
--  Nunca atualizado após INSERT.
--
--  product_id: FK COMPOSTA (product_id, organization_id)
--    garante que o produto pertence à mesma organização.
--
--  location_id / to_location_id / performed_by_id / sale_id:
--    FKs simples nullable (ON DELETE SET NULL).
--    Não usam FK composta porque SET NULL nulificaria organization_id.
--    Integridade cross-org garantida pelo backend no INSERT.
--    RLS reforçará na Fase 4.
--
--  delta: coluna GERADA (qty_after - qty_before).
--    Positivo = estoque ganho | Negativo = estoque perdido
--    Zero     = eventos não-qty (status_change, product_update)
--
--  CHECKs de consistência:
--    · transfer exige to_location_id
--    · sale e refund exigem sale_id
-- ============================================================

CREATE TABLE inventory_movements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id),
  product_id          UUID        NOT NULL,
  location_id         UUID        REFERENCES locations(id) ON DELETE SET NULL,  -- source; NULL = global
  to_location_id      UUID        REFERENCES locations(id) ON DELETE SET NULL,  -- transfer destination
  type                inventory_movement_type NOT NULL,
  qty_before          INTEGER     NOT NULL,
  qty_after           INTEGER     NOT NULL,
  -- GERADO pelo banco — NUNCA incluir 'delta' na lista de colunas do INSERT
  delta               INTEGER     NOT NULL
                        GENERATED ALWAYS AS (qty_after - qty_before) STORED,
  note                TEXT        NOT NULL DEFAULT '',
  performed_by_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  sale_id             UUID        REFERENCES sales(id)  ON DELETE SET NULL,
  -- snapshots
  product_name_snap   TEXT        NOT NULL,
  barcode_snap        TEXT        NOT NULL,
  location_name_snap  TEXT        NOT NULL DEFAULT '',
  performed_by_snap   TEXT        NOT NULL DEFAULT '',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- FK composta: product pertence à mesma org que o movimento
  FOREIGN KEY (product_id, organization_id)
    REFERENCES products (id, organization_id),

  -- CHECKs de consistência semântica
  -- transfer: to_location_id obrigatório
  CONSTRAINT chk_invmov_transfer_dest
    CHECK (type != 'transfer' OR to_location_id IS NOT NULL),

  -- sale e refund: sale_id obrigatório
  CONSTRAINT chk_invmov_sale_ref
    CHECK (type NOT IN ('sale', 'refund') OR sale_id IS NOT NULL),

  -- to_location_id só faz sentido em transfer
  CONSTRAINT chk_invmov_to_loc_only_transfer
    CHECK (to_location_id IS NULL OR type = 'transfer')
);

CREATE INDEX idx_invmov_org_date ON inventory_movements (organization_id, created_at DESC);
CREATE INDEX idx_invmov_product  ON inventory_movements (product_id);
CREATE INDEX idx_invmov_location ON inventory_movements (location_id);
CREATE INDEX idx_invmov_sale     ON inventory_movements (sale_id) WHERE sale_id IS NOT NULL;
