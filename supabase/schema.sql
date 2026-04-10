create table if not exists public.wholesale_products (
  woo_product_id bigint primary key,
  sku text,
  name text not null,
  is_active boolean not null default false,
  min_quantity integer not null default 1 check (min_quantity >= 1),
  custom_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wholesale_products_is_active_idx
  on public.wholesale_products (is_active);

create index if not exists wholesale_products_sku_idx
  on public.wholesale_products (sku);

create or replace function public.set_updated_at_wholesale_products()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_wholesale_products on public.wholesale_products;
create trigger trg_set_updated_at_wholesale_products
before update on public.wholesale_products
for each row
execute function public.set_updated_at_wholesale_products();

alter table public.wholesale_products enable row level security;

drop policy if exists "wholesale_products_select_authenticated" on public.wholesale_products;
create policy "wholesale_products_select_authenticated"
on public.wholesale_products
for select
to authenticated
using (true);

drop policy if exists "wholesale_products_insert_authenticated" on public.wholesale_products;
create policy "wholesale_products_insert_authenticated"
on public.wholesale_products
for insert
to authenticated
with check (true);

drop policy if exists "wholesale_products_update_authenticated" on public.wholesale_products;
create policy "wholesale_products_update_authenticated"
on public.wholesale_products
for update
to authenticated
using (true)
with check (true);

drop policy if exists "wholesale_products_delete_authenticated" on public.wholesale_products;
create policy "wholesale_products_delete_authenticated"
on public.wholesale_products
for delete
to authenticated
using (true);
