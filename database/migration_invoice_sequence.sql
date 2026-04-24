-- ─────────────────────────────────────────────────────────────────────────────
-- migration_invoice_sequence.sql
--
-- Objetivo: expor a invoice_number_seq do Postgres via RPC para que o frontend
-- possa gerar números de invoice sequenciais e únicos entre os dois kiosks.
--
-- Executar UMA vez no Supabase SQL Editor.
--
-- Passos:
--   1. Garantir que a sequence existe (idempotente)
--   2. Sincronizar a sequence com o maior number já salvo em sales
--      (evita colisão com invoices já existentes)
--   3. Criar o RPC next_invoice_number()
--   4. Grants
--   5. Validação
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Sequence (CREATE IF NOT EXISTS — idempotente) ─────────────────────
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
  START     60001
  INCREMENT 1
  NO CYCLE;


-- ── Step 2: Sincronizar com invoices já existentes ────────────────────────────
-- Garante que o próximo valor gerado seja maior que qualquer number já salvo.
-- GREATEST(max_existente, 60000) = nunca vai para trás.
-- Seguro rodar múltiplas vezes — setval é idempotente na prática.
SELECT setval(
  'invoice_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(number), 60000) FROM sales),
    60000
  )
);


-- ── Step 3: RPC next_invoice_number() ────────────────────────────────────────
-- SECURITY DEFINER: roda como postgres — pode chamar nextval sem RLS.
-- Retorna INTEGER (não BIGINT) para compatibilidade com o frontend.
-- Cada chamada avança a sequence de forma atômica — sem colisão possível
-- mesmo com os dois kiosks chamando ao mesmo tempo.

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('invoice_number_seq')::INTEGER;
$$;


-- ── Step 4: Grants ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION next_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_invoice_number() TO anon, authenticated;


-- ── Step 5: Validação ─────────────────────────────────────────────────────────

-- Estado atual da sequence:
SELECT last_value, is_called FROM invoice_number_seq;

-- Testar o RPC (deve retornar um número > max(sales.number)):
SELECT next_invoice_number() AS next_number;

-- Confirmar que não há colisão com invoices existentes:
SELECT
  next_invoice_number()                     AS rpc_returned,
  (SELECT MAX(number) FROM sales)           AS max_existing,
  next_invoice_number() >
    COALESCE((SELECT MAX(number) FROM sales), 0) AS no_collision;
-- ─────────────────────────────────────────────────────────────────────────────
