/**
 * Normaliza un teléfono para wa.me (solo dígitos, prefijo Uruguay 598).
 */
export function normalizarTelefonoWaUruguay(telefono: string | undefined | null): string | null {
  if (!telefono?.trim()) return null;
  const soloDigitos = telefono.replace(/\D/g, "");
  if (!soloDigitos) return null;
  if (soloDigitos.startsWith("598")) {
    return soloDigitos;
  }
  if (soloDigitos.startsWith("0")) {
    return `598${soloDigitos.slice(1)}`;
  }
  return `598${soloDigitos}`;
}
