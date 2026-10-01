import { notFound } from "next/navigation";
import { DossierShell } from "@/components/layout/DossierShell";

export default async function DossierLayout({ children, params }: LayoutProps<"/dossier/[id]">) {
  const { id } = await params;
  if (!/^app_[0-9a-f-]{36}$/.test(id)) {
    notFound();
  }
  return <DossierShell>{children}</DossierShell>;
}
