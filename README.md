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
Luego ejecutar `supabase/schema_phase2_cache.sql` para crear la tabla cache de catálogo Woo.

## Desarrollo

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000/admin`.

## Estructura principal

- `app/admin/page.tsx` panel admin
- `components/admin/products-table.tsx` grilla de catálogo y toggles
- `app/api/products/route.ts` catálogo desde cache Supabase + estado mayorista
- `app/api/products/toggle/route.ts` toggle activo/inactivo en Supabase
- `app/api/sync/woo/route.ts` sync manual/cron completo Woo -> cache
- `app/api/webhooks/woocommerce/route.ts` sync incremental por cambios de Woo
- `lib/woo.ts` cliente WooCommerce
- `lib/catalog-sync.ts` mapeo y upsert/delete de cache
- `lib/supabase-admin.ts` cliente server-side Supabase

## Flujo de sincronización recomendado

1. Seed inicial:
   - Hacer `POST /api/sync/woo` con header `Authorization: Bearer <WHOLESALE_SYNC_TOKEN>`.
2. Incremental:
   - Configurar webhooks de Woo a `POST /api/webhooks/woocommerce`.
   - Topic recomendado: `product.created`, `product.updated`, `product.deleted`.
   - Secret del webhook en Woo = `WOO_WEBHOOK_SECRET`.
3. Respaldo automático:
   - `vercel.json` define cron cada 6h hacia `/api/sync/woo` (header `x-vercel-cron`).
