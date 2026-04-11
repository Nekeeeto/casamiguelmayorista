/** IDs de la categoria raiz y todas sus subcategorias (Woo: id_padre en arbol). */
export function idsCategoriaMasDescendientes(
  idRaiz: number,
  categorias: { woo_term_id: number; id_padre: number }[],
): number[] {
  const hijosPorPadre = new Map<number, number[]>();

  for (const fila of categorias) {
    const padre = Number(fila.id_padre);
    if (!hijosPorPadre.has(padre)) {
      hijosPorPadre.set(padre, []);
    }
    hijosPorPadre.get(padre)!.push(Number(fila.woo_term_id));
  }

  const resultado: number[] = [];
  const cola = [idRaiz];

  while (cola.length > 0) {
    const id = cola.shift()!;
    resultado.push(id);
    const hijos = hijosPorPadre.get(id);
    if (hijos?.length) {
      cola.push(...hijos);
    }
  }

  return resultado;
}
