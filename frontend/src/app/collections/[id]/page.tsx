import { redirect } from "next/navigation";
import { extractCleanPostId } from "@/lib/share";

export default async function CollectionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cleanId = extractCleanPostId(id);
  redirect(`/articles/${cleanId}`);
}
