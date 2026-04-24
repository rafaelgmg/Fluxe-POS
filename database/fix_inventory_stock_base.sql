-- ─────────────────────────────────────────────────────────────────────────────
-- fix_inventory_stock_base.sql
--
-- OBJETIVO: garantir que todo produto ativo tenha uma linha em inventory_stock
-- para cada location ativa da mesma organização.
--
-- SEGURO:
--   • Nunca altera qty de linhas existentes
--   • Só insere linhas faltantes com qty = 0
--   • ON CONFLICT DO NOTHING como segurança extra (PK já garante unicidade)
--
-- EXECUTAR EM DUAS ETAPAS:
--   1. Rode o bloco de DIAGNÓSTICO — confirme os resultados
--   2. Rode o bloco de CORREÇÃO — insere apenas as linhas faltantes
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- PASSO 1 — DIAGNÓSTICO
-- Mostra o status de cada combinação produto × location.
-- Linhas com '⚠️ MISSING' são as que precisam ser criadas.
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  p.id          AS product_id,
  p.name        AS product_name,
  l.id          AS location_id,
  l.name        AS location_name,
  CASE
    WHEN s.product_id IS NULL THEN '⚠️  MISSING'
    ELSE '✅ OK  (qty = ' || s.qty || ')'
  END AS stock_status
FROM products  p
CROSS JOIN locations l
LEFT  JOIN inventory_stock s
       ON  s.product_id   = p.id
       AND s.location_id  = l.id
WHERE p.organization_id  = l.organization_id
  AND p.organization_id  = (SELECT id FROM organizations LIMIT 1)
  AND p.status           = 'active'
  AND l.status           = 'active'
ORDER BY
  stock_status DESC,   -- MISSING aparecem primeiro
  p.name        ASC,
  l.name        ASC;


-- ══════════════════════════════════════════════════════════════════════════════
-- PASSO 1b — RESUMO rápido: quantas linhas faltam
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  COUNT(*) FILTER (WHERE s.product_id IS NULL) AS missing_rows,
  COUNT(*) FILTER (WHERE s.product_id IS NOT NULL) AS existing_rows,
  COUNT(*) AS total_combinations
FROM products  p
CROSS JOIN locations l
LEFT  JOIN inventory_stock s
       ON  s.product_id  = p.id
       AND s.location_id = l.id
WHERE p.organization_id  = l.organization_id
  AND p.organization_id  = (SELECT id FROM organizations LIMIT 1)
  AND p.status           = 'active'
  AND l.status           = 'active';


-- ══════════════════════════════════════════════════════════════════════════════
-- PASSO 2 — CORREÇÃO
-- Execute SOMENTE após confirmar o diagnóstico acima.
-- Insere linhas faltantes com qty = 0.
-- Linhas existentes NÃO são alteradas (qty preservado).
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO inventory_stock (product_id, location_id, organization_id, qty)
SELECT
  p.id                AS product_id,
  l.id                AS location_id,
  p.organization_id   AS organization_id,
  0                   AS qty
FROM products  p
CROSS JOIN locations l
WHERE p.organization_id  = l.organization_id
  AND p.organization_id  = (SELECT id FROM organizations LIMIT 1)
  AND p.status           = 'active'
  AND l.status           = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_stock s
    WHERE s.product_id   = p.id
      AND s.location_id  = l.id
  )
ON CONFLICT (product_id, location_id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- PASSO 3 — VALIDAÇÃO PÓS-CORREÇÃO
-- Deve retornar: missing_rows = 0
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  COUNT(*) FILTER (WHERE s.product_id IS NULL) AS missing_rows,
  COUNT(*) FILTER (WHERE s.product_id IS NOT NULL) AS existing_rows,
  COUNT(*) AS total_combinations
FROM products  p
CROSS JOIN locations l
LEFT  JOIN inventory_stock s
       ON  s.product_id  = p.id
       AND s.location_id = l.id
WHERE p.organization_id  = l.organization_id
  AND p.organization_id  = (SELECT id FROM organizations LIMIT 1)
  AND p.status           = 'active'
  AND l.status           = 'active';

-- Resultado esperado: missing_rows = 0
-- ─────────────────────────────────────────────────────────────────────────────
