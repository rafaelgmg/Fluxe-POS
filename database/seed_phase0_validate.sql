-- ============================================================
--  VALIDAÇÃO PÓS-SEED — Fase 0
--  Fluxe POS · Supabase / PostgreSQL
--
--  Rodar no Supabase SQL Editor APÓS seed_phase0.js completar
--  sem erros. Cada bloco deve retornar resultado esperado.
--
--  CRITÉRIO DE PRONTO:
--    Todos os blocos retornam o esperado → Fase 0 concluída.
--    Qualquer divergência → investigar antes de prosseguir.
-- ============================================================


-- ============================================================
--  1. CONTAGEM GERAL POR TABELA
--  Esperado: todos os valores > 0 (exceto onde indicado)
-- ============================================================

SELECT
  'organizations'        AS tabela, COUNT(*) AS total FROM organizations
UNION ALL SELECT 'locations',          COUNT(*) FROM locations
UNION ALL SELECT 'users',              COUNT(*) FROM users
UNION ALL SELECT 'user_location_access', COUNT(*) FROM user_location_access
UNION ALL SELECT 'categories',         COUNT(*) FROM categories
UNION ALL SELECT 'products',           COUNT(*) FROM products
UNION ALL SELECT 'inventory_stock',    COUNT(*) FROM inventory_stock
UNION ALL SELECT 'sales',              COUNT(*) FROM sales
UNION ALL SELECT 'sale_items',         COUNT(*) FROM sale_items
UNION ALL SELECT 'payments',           COUNT(*) FROM payments
UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
ORDER BY tabela;


-- ============================================================
--  2. STATUS DAS VENDAS
--  Esperado: ZERO linhas com 'normal' ou 'deleted'
--  Valores válidos: 'completed', 'voided'
-- ============================================================

SELECT status, COUNT(*) AS total
FROM sales
GROUP BY status
ORDER BY status;

-- Deve retornar 0:
SELECT COUNT(*) AS invalidos_esperado_zero
FROM sales
WHERE status NOT IN ('completed', 'voided');


-- ============================================================
--  3. SEQUENCE DO INVOICE NUMBER
--  Comparar last_value com MAX(number) em sales.
--  Se last_value < MAX(number), rodar o SELECT setval() abaixo.
-- ============================================================

SELECT last_value AS seq_atual FROM invoice_number_seq;

SELECT MAX(number) AS max_invoice_number FROM sales;

-- Se seq_atual < max_invoice_number, rodar:
-- SELECT setval('invoice_number_seq', (SELECT MAX(number) FROM sales));


-- ============================================================
--  4. VENDAS SEM ITENS
--  Esperado: 0 linhas (toda venda deve ter pelo menos 1 item)
-- ============================================================

SELECT s.id, s.number, s.status, s.sold_at
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
WHERE si.id IS NULL
ORDER BY s.number;


-- ============================================================
--  5. VENDAS COMPLETED SEM PAGAMENTO
--  Esperado: 0 linhas (venda concluída deve ter pelo menos 1 pagamento)
-- ============================================================

SELECT s.id, s.number, s.sold_at
FROM sales s
LEFT JOIN payments p ON p.sale_id = s.id
WHERE s.status = 'completed'
  AND p.id IS NULL
ORDER BY s.number;


-- ============================================================
--  6. MÉTODOS DE PAGAMENTO INVÁLIDOS
--  Esperado: 0 linhas
--  Valores válidos: cash, card, external, check
-- ============================================================

SELECT method, COUNT(*) AS total
FROM payments
GROUP BY method
ORDER BY method;

-- Apenas para confirmar ausência de valores legados:
SELECT COUNT(*) AS legados_esperado_zero
FROM payments
WHERE method NOT IN ('cash', 'card', 'external', 'check');


-- ============================================================
--  7. DELTA EM INVENTORY_MOVEMENTS
--  Esperado: 0 linhas — delta deve sempre ser qty_after - qty_before
-- ============================================================

SELECT id, type, qty_before, qty_after, delta,
       (qty_after - qty_before) AS calculado,
       delta - (qty_after - qty_before) AS diferenca
FROM inventory_movements
WHERE delta <> (qty_after - qty_before)
ORDER BY id;


-- ============================================================
--  8. ESTOQUE NEGATIVO
--  Esperado: 0 linhas (qty nunca deve ser negativa após seed)
-- ============================================================

SELECT
  p.name AS produto,
  l.name AS location,
  ist.qty
FROM inventory_stock ist
JOIN products  p ON p.id = ist.product_id
JOIN locations l ON l.id = ist.location_id
WHERE ist.qty < 0
ORDER BY ist.qty;


-- ============================================================
--  9. PRODUTOS SEM CATEGORIA (aviso, não bloqueante)
--  Esperado: pode ter linhas — produto sem categoria é permitido
-- ============================================================

SELECT id, name, barcode
FROM products
WHERE category_id IS NULL
ORDER BY name;


-- ============================================================
--  10. CONSISTÊNCIA DE organization_id
--  Esperado: apenas 1 org_id distinto por tabela (single-tenant seed)
-- ============================================================

SELECT 'locations'    AS tabela, COUNT(DISTINCT organization_id) AS orgs_distintas FROM locations
UNION ALL SELECT 'users',         COUNT(DISTINCT organization_id) FROM users
UNION ALL SELECT 'categories',    COUNT(DISTINCT organization_id) FROM categories
UNION ALL SELECT 'products',      COUNT(DISTINCT organization_id) FROM products
UNION ALL SELECT 'sales',         COUNT(DISTINCT organization_id) FROM sales
UNION ALL SELECT 'sale_items',    COUNT(DISTINCT organization_id) FROM sale_items
UNION ALL SELECT 'payments',      COUNT(DISTINCT organization_id) FROM payments
UNION ALL SELECT 'inventory_stock', COUNT(DISTINCT organization_id) FROM inventory_stock
UNION ALL SELECT 'inventory_movements', COUNT(DISTINCT organization_id) FROM inventory_movements
ORDER BY tabela;


-- ============================================================
--  11. INTEGRIDADE DE FKs — produtos sem categoria válida
--  Esperado: 0 linhas (produtos com category_id apontando para
--  categoria inexistente ou de outra org)
-- ============================================================

SELECT p.id, p.name, p.category_id
FROM products p
WHERE p.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = p.category_id
      AND c.organization_id = p.organization_id
  );


-- ============================================================
--  12. USUÁRIOS COM PIN DUPLICADO (apenas ativos)
--  Esperado: 0 linhas — PIN deve ser único entre usuários ativos
-- ============================================================

SELECT pin, COUNT(*) AS total
FROM users
WHERE status = 'active'
GROUP BY pin
HAVING COUNT(*) > 1;


-- ============================================================
--  13. SALE_ITEMS COM PREÇOS INVÁLIDOS
--  Esperado: 0 linhas (unit_price e final_price não podem ser negativos)
-- ============================================================

SELECT si.id, s.number AS invoice, si.product_name, si.unit_price, si.final_price
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE si.unit_price < 0
   OR si.final_price < 0
ORDER BY s.number;


-- ============================================================
--  14. RESUMO FINANCEIRO DO SEED
--  Para comparar com totais do localStorage
-- ============================================================

SELECT
  COUNT(*)                                   AS total_vendas,
  COUNT(*) FILTER (WHERE status='completed') AS completed,
  COUNT(*) FILTER (WHERE status='voided')    AS voided,
  SUM(total)  FILTER (WHERE status='completed') AS receita_bruta,
  SUM(tax)    FILTER (WHERE status='completed') AS total_tax,
  SUM(subtotal) FILTER (WHERE status='completed') AS subtotal_total
FROM sales;


-- ============================================================
--  CRITÉRIO DE PRONTO — CHECKLIST FINAL
-- ============================================================
--
--  [ ] Bloco 1:  Todas as tabelas com total > 0
--  [ ] Bloco 2:  Nenhum status 'normal' ou 'deleted' (contador = 0)
--  [ ] Bloco 3:  seq_atual >= max_invoice_number (resetar se necessário)
--  [ ] Bloco 4:  0 vendas sem itens
--  [ ] Bloco 5:  0 vendas completed sem pagamento
--  [ ] Bloco 6:  0 métodos de pagamento inválidos
--  [ ] Bloco 7:  0 linhas com delta incorreto
--  [ ] Bloco 8:  0 linhas com estoque negativo
--  [ ] Bloco 9:  Verificado (aviso — não bloqueante)
--  [ ] Bloco 10: Apenas 1 org distinta por tabela
--  [ ] Bloco 11: 0 produtos com FK de categoria inválida
--  [ ] Bloco 12: 0 PINs duplicados entre usuários ativos
--  [ ] Bloco 13: 0 itens com preço negativo
--  [ ] Bloco 14: Totais fazem sentido vs. dados no localStorage
--
--  Todos marcados? Fase 0 concluída. Prosseguir para Fase 1.
-- ============================================================
