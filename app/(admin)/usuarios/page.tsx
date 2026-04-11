import { redirect } from "next/navigation";

export default function UsuariosAdminPage() {
  redirect("/admin?tab=usuarios");
}
