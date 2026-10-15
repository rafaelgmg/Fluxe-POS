-- Read-only post-migration check. Does not call enqueue_receipt or modify rows.
-- Expected: all boolean columns true for each of the three roles.
WITH roles AS (
  SELECT rolname::text AS role_name
  FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
), permissions AS (
  SELECT role_name,
    has_table_privilege(role_name, 'public.receipt_queue', 'SELECT') AS can_select,
    has_table_privilege(role_name, 'public.receipt_queue', 'INSERT') AS can_insert,
    has_table_privilege(role_name, 'public.receipt_queue', 'UPDATE') AS can_update,
    has_table_privilege(role_name, 'public.receipt_queue', 'DELETE') AS can_delete,
    has_table_privilege(role_name, 'public.receipt_queue', 'TRUNCATE') AS can_truncate,
    has_any_column_privilege(role_name, 'public.receipt_queue', 'SELECT') AS column_select,
    has_any_column_privilege(role_name, 'public.receipt_queue', 'INSERT') AS column_insert,
    has_any_column_privilege(role_name, 'public.receipt_queue', 'UPDATE') AS column_update,
    has_function_privilege(role_name,
      'public.enqueue_receipt(uuid,uuid,uuid,text)', 'EXECUTE') AS can_execute
  FROM roles
)
SELECT role_name AS papel,
  CASE WHEN role_name = 'service_role'
    THEN can_select AND can_insert AND can_update
    ELSE NOT (can_select OR can_insert OR can_update OR can_delete OR can_truncate
      OR column_select OR column_insert OR column_update)
  END AS permissoes_tabela_corretas,
  (can_execute = (role_name = 'service_role')) AS permissao_funcao_correta
FROM permissions
ORDER BY role_name;
