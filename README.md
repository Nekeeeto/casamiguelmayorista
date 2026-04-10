# Casa Miguel Mayoristas — Fase 1

Panel de administración B2B Headless para habilitar/deshabilitar productos mayoristas desde catálogo WooCommerce.

## Stack

- Next.js (App Router)
- Tailwind CSS + UI estilo shadcn
- Supabase (tabla `wholesale_products`)
- WooCommerce REST API

## Variables de entorno

1. Copiar `.env.example` a `.env.local`
2. Completar:
   - `WOO_URL`
   - `WOO_KEY`
   - `WOO_SECRET`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. **Catálogo en el admin (opcional):** si no definís `WHOLESALE_CATALOG_LIMIT`, por defecto se cargan **5** productos (rápido para probar). Para traer **todo** el catálogo (lento en tiendas grandes), definí `WHOLESALE_CATALOG_LIMIT=all` en `.env.local` y en Vercel.

## SQL en Supabase

Ejecutar `supabase/schema.sql` en el SQL Editor del proyecto.

## Desarrollo

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000/admin`.

## Estructura principal

- `app/admin/page.tsx` panel admin
- `components/admin/products-table.tsx` grilla de catálogo y toggles
- `app/api/products/route.ts` catálogo Woo + estado mayorista
- `app/api/products/toggle/route.ts` toggle activo/inactivo en Supabase
- `lib/woo.ts` cliente WooCommerce
- `lib/supabase-admin.ts` cliente server-side Supabase
