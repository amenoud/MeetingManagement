-- Test-only tables (never part of the production schema), applied by app_migrator after the real migrations.
-- They follow the table convention of docs/specs/PLAN-DB-02.md.

-- A table keyed by the tenant itself (like the future app.tenant).
create table app.iso_tenant_like (
  id uuid primary key,
  name text not null
);
select app.enable_tenant_isolation('app.iso_tenant_like', 'id');

create table app.iso_parent (
  tenant_id uuid not null default app.current_tenant_id(),
  id uuid not null,
  name text not null,
  primary key (tenant_id, id),
  unique (tenant_id, name)
);
select app.enable_tenant_isolation('app.iso_parent');

-- Composite FK: cannot point to another tenant's parent.
create table app.iso_child (
  tenant_id uuid not null default app.current_tenant_id(),
  id uuid not null,
  parent_id uuid not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, parent_id) references app.iso_parent (tenant_id, id)
);
select app.enable_tenant_isolation('app.iso_child');

-- NEGATIVE CONTROL: single-column FK. Referential checks ignore RLS, so this lets a row point to
-- another tenant's parent. It exists only to prove why composite FKs are mandatory.
create table app.iso_parent_naive (
  tenant_id uuid not null default app.current_tenant_id(),
  id uuid primary key
);
select app.enable_tenant_isolation('app.iso_parent_naive');

create table app.iso_child_naive (
  tenant_id uuid not null default app.current_tenant_id(),
  id uuid primary key,
  parent_id uuid not null references app.iso_parent_naive (id)
);
select app.enable_tenant_isolation('app.iso_child_naive');
