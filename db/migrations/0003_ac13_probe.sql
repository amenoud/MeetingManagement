-- AC13 probe (throwaway): a tenant table WITHOUT enable_tenant_isolation.
create table app.ac13_probe (
  tenant_id uuid not null default app.current_tenant_id(),
  id uuid not null,
  primary key (tenant_id, id)
);
