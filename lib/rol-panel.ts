export type RolPanelInventarioPedidos = "admin" | "shop_manager";

export function rolPuedeInventarioPedidos(rol: string | null | undefined): rol is RolPanelInventarioPedidos {
  return rol === "admin" || rol === "shop_manager";
}

export function rolEsAdmin(rol: string | null | undefined): boolean {
  return rol === "admin";
}
