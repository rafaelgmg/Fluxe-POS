-- ============================================================
--  MIGRAÇÃO: sale_status enum  v1.0 → v1.2
--  Supabase / PostgreSQL
--
--  QUANDO USAR:
--    Somente se o schema v1.0 (com 'normal' e 'deleted') já foi
--    aplicado no Supabase e existem dados na tabela sales.
--    Se o banco está sendo criado do zero, NÃO rodar este arquivo
--    — o schema v1.2 já cria o enum correto diretamente.
--
--  COMO RODAR:
--    Execute os 3 passos abaixo em ORDENS SEPARADAS no Supabase
--    SQL Editor (cada passo deve ser commitado antes do próximo).
--    Rodar tudo junto em um único bloco causa erro porque o Postgres
--    não permite usar novos valores de enum na mesma transação
--    em que foram criados.
--
--  IMPACTO:
--    · Nenhuma coluna é adicionada ou removida
--    · Nenhum dado é perdido
--    · O default de sales.status muda de 'normal' para 'completed'
--    · Os valores antigos 'normal' e 'deleted' são removidos do enum
-- ============================================================


-- ============================================================
--  PASSO 1 — Adicionar os novos valores ao enum existente
--  (rodar isolado; aguardar commit do Supabase antes do passo 2)
-- ============================================================

ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'voided';


-- ============================================================
--  PASSO 2 — Migrar os dados existentes para os novos valores
--  (rodar após o passo 1 ter sido commitado)
-- ============================================================

UPDATE sales SET status = 'completed' WHERE status = 'normal';
UPDATE sales SET status = 'voided'    WHERE status = 'deleted';

-- Verificação (deve retornar 0 linhas antes de prosseguir):
-- SELECT COUNT(*) FROM sales WHERE status IN ('normal', 'deleted');


-- ============================================================
--  PASSO 3 — Substituir o tipo pelo enum limpo (sem valores antigos)
--  (rodar após o passo 2 ter sido commitado e verificado)
--
--  Sequência necessária porque Postgres não suporta DROP de
--  valores individuais de um enum — precisa recriar o tipo inteiro.
-- ============================================================

BEGIN;

  -- 3a. Converter coluna para TEXT temporariamente
  ALTER TABLE sales ALTER COLUMN status DROP DEFAULT;
  ALTER TABLE sales ALTER COLUMN status TYPE TEXT;

  -- 3b. Recriar o enum apenas com os valores finais
  DROP TYPE sale_status;
  CREATE TYPE sale_status AS ENUM ('completed', 'voided');

  -- 3c. Restaurar a coluna com o tipo novo
  ALTER TABLE sales ALTER COLUMN status TYPE sale_status
    USING status::sale_status;
  ALTER TABLE sales ALTER COLUMN status SET DEFAULT 'completed';

COMMIT;


-- ============================================================
--  VERIFICAÇÃO FINAL
--  Após os 3 passos, confirmar que:
--    · Nenhuma venda ficou com status inválido
--    · O default está correto
-- ============================================================

-- SELECT status, COUNT(*) FROM sales GROUP BY status;
-- SELECT column_default FROM information_schema.columns
--   WHERE table_name = 'sales' AND column_name = 'status';
