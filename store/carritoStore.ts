"use client";

import { create } from "zustand";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type ArticuloCarrito = {
  producto_id: number;
  sku?: string | null;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
};

type CarritoState = {
  articulos: ArticuloCarrito[];
  cargando: boolean;
  error: string | null;
  setArticulos: (articulos: ArticuloCarrito[]) => void;
  cargarDesdeNube: (idUsuario: string) => Promise<void>;
  sincronizarNube: (idUsuario: string) => Promise<void>;
  agregarArticulo: (articulo: ArticuloCarrito, idUsuario?: string) => Promise<void>;
  actualizarCantidad: (
    productoId: number,
    cantidad: number,
    idUsuario?: string,
  ) => Promise<void>;
  quitarArticulo: (productoId: number, idUsuario?: string) => Promise<void>;
  vaciarCarrito: (idUsuario?: string) => Promise<void>;
};

function normalizarArticulos(payload: unknown): ArticuloCarrito[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => item as Partial<ArticuloCarrito>)
    .filter(
      (item): item is ArticuloCarrito =>
        typeof item.producto_id === "number" &&
        typeof item.nombre === "string" &&
        typeof item.precio_unitario === "number" &&
        typeof item.cantidad === "number",
    )
    .filter((item) => item.cantidad > 0);
}

export const useCarritoStore = create<CarritoState>((set, get) => ({
  articulos: [],
  cargando: false,
  error: null,

  setArticulos: (articulos) => set({ articulos, error: null }),

  cargarDesdeNube: async (idUsuario) => {
    set({ cargando: true, error: null });

    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("carritos_b2b")
        .select("articulos")
        .eq("id_usuario", idUsuario)
        .maybeSingle();

      if (error) {
        throw error;
      }

      set({
        articulos: normalizarArticulos(data?.articulos),
        cargando: false,
        error: null,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "No se pudo cargar el carrito";
      set({ cargando: false, error: mensaje });
    }
  },

  sincronizarNube: async (idUsuario) => {
    try {
      const supabase = getSupabaseBrowser();
      const articulos = get().articulos;
      const { error } = await supabase.from("carritos_b2b").upsert(
        {
          id_usuario: idUsuario,
          articulos,
        },
        { onConflict: "id_usuario" },
      );

      if (error) {
        throw error;
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "No se pudo sincronizar el carrito";
      set({ error: mensaje });
    }
  },

  agregarArticulo: async (articulo, idUsuario) => {
    const articulosActuales = get().articulos;
    const indiceExistente = articulosActuales.findIndex(
      (item) => item.producto_id === articulo.producto_id,
    );

    const siguienteCarrito =
      indiceExistente >= 0
        ? articulosActuales.map((item, index) =>
            index === indiceExistente
              ? { ...item, cantidad: item.cantidad + articulo.cantidad }
              : item,
          )
        : [...articulosActuales, articulo];

    set({ articulos: siguienteCarrito, error: null });

    if (idUsuario) {
      await get().sincronizarNube(idUsuario);
    }
  },

  actualizarCantidad: async (productoId, cantidad, idUsuario) => {
    if (cantidad <= 0) {
      await get().quitarArticulo(productoId, idUsuario);
      return;
    }

    const siguienteCarrito = get().articulos.map((item) =>
      item.producto_id === productoId ? { ...item, cantidad } : item,
    );
    set({ articulos: siguienteCarrito, error: null });

    if (idUsuario) {
      await get().sincronizarNube(idUsuario);
    }
  },

  quitarArticulo: async (productoId, idUsuario) => {
    const siguienteCarrito = get().articulos.filter((item) => item.producto_id !== productoId);
    set({ articulos: siguienteCarrito, error: null });

    if (idUsuario) {
      await get().sincronizarNube(idUsuario);
    }
  },

  vaciarCarrito: async (idUsuario) => {
    set({ articulos: [], error: null });

    if (idUsuario) {
      await get().sincronizarNube(idUsuario);
    }
  },
}));
