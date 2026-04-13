-- Permite el rol encargado de tienda (inventario + pedidos, sin usuarios ni analíticas).
alter table public.perfiles_usuarios
  drop constraint if exists perfiles_usuarios_rol_check;

alter table public.perfiles_usuarios
  add constraint perfiles_usuarios_rol_check
  check (rol in ('admin', 'pendiente', 'aprobado', 'shop_manager'));
