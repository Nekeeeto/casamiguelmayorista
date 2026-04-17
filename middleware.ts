import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_TIENDA = ["/panel", "/carrito", "/pedidos"];
const RUTAS_ADMIN = [
  "/admin",
  "/usuarios",
  "/inventario",
  "/analiticas",
  "/herramientas",
  "/herramientas-ia",
  "/proveedores",
];

function esRutaProtegida(pathname: string, rutas: string[]) {
  return rutas.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

function redirigir(request: NextRequest, destino: string) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  return NextResponse.redirect(url);
}

function redirigirShopManagerInventario(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin";
  url.searchParams.set("tab", "inventario");
  url.searchParams.set("page", "1");
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  /**
   * Assets, API y utilidades de Next: no mutar la request ni cookies.
   * Si el middleware corre aquí, la app puede quedar sin CSS/JS (pantalla “sin Tailwind”).
   */
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known") ||
    pathname.startsWith("/__nextjs") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/ingest") ||
    pathname.includes("webpack-hmr") ||
    pathname.includes("hot-update")
  ) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const tiendaProtegida = esRutaProtegida(pathname, RUTAS_TIENDA);
  const adminProtegida = esRutaProtegida(pathname, RUTAS_ADMIN);

  if (!tiendaProtegida && !adminProtegida) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          try {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
          } catch {
            /** En algunos runtimes `request.cookies` puede rechazar mutación; la respuesta sigue llevando Set-Cookie. */
          }
          response = NextResponse.next({ request });
          if (cacheHeaders && typeof cacheHeaders === "object") {
            for (const [clave, valor] of Object.entries(cacheHeaders)) {
              if (typeof valor === "string") {
                response.headers.set(clave, valor);
              }
            }
          }
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { data: perfil } = await supabase
      .from("perfiles_usuarios")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();

    const rol = perfil?.rol ?? "pendiente";

    if (tiendaProtegida && rol === "pendiente") {
      return redirigir(request, "/sala-espera");
    }

    const accesoStaffPanel = rol === "admin" || rol === "shop_manager";
    if (adminProtegida && !accesoStaffPanel) {
      return redirigir(request, "/no-autorizado");
    }

    if (adminProtegida && rol === "shop_manager") {
      if (pathname.startsWith("/admin/pedidos")) {
        return response;
      }
      if (pathname === "/inventario" || pathname.startsWith("/inventario/")) {
        return response;
      }
      if (pathname.startsWith("/admin/inventario")) {
        return response;
      }
      if (pathname === "/admin") {
        const pestana = request.nextUrl.searchParams.get("tab");
        if (pestana === "inventario") {
          return response;
        }
        return redirigirShopManagerInventario(request);
      }
      return redirigirShopManagerInventario(request);
    }

    return response;
  } catch (error) {
    console.error("[middleware]", error);
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Excluir todo `/_next/` (no solo static/image): Turbopack, chunks, webpack-hmr, flight, etc.
     * Si el middleware corre ahí, puede romper CSS/JS y la página queda “sin Tailwind”.
     */
    "/((?!api|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
