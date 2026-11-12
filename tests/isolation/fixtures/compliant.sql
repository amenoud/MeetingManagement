-- A set of tables that follow every convention (PLAN-TST-01). The audit must report nothing for them.
-- Declared in the test as exceptions: app.aud_root (root table, column id) and app.aud_global (global table).

create table app.aud_root (
  id uuid primary key,
  name text not null
);
select app.enable_tenant_isolation('app.aud_root', 'id');

create table app.aud_global (
  id uuid primary key,
  email text not null unique
);

create table app.aud_parent (
  tenant_id uuid not null default app.current_tenant_id() references app.aud_root (id),
  id uuid not null,
  name text not null,
  owner_id uuid references app.aud_global (id),
  primary key (tenant_id, id),
  unique (tenant_id, name)
);
select app.enable_tenant_isolation('app.aud_parent');

create table app.aud_child (
  tenant_id uuid not null default app.current_tenant_id(),
  id uuid not null,
  parent_id uuid not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, parent_id) references app.aud_parent (tenant_id, id)
);
select app.enable_tenant_isolation('app.aud_child');

create view app.aud_view with (security_invoker = true) as select * from app.aud_parent;
