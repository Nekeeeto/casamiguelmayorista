import { redirect } from "next/navigation";

export default function InventarioAdminPage() {
  redirect("/admin?tab=inventario");
}
