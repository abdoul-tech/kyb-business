import { redirect } from "next/navigation";

export default async function DossierPage({ params }: PageProps<"/dossier/[id]">) {
  const { id } = await params;
  redirect(`/dossier/${id}/documents`);
}
