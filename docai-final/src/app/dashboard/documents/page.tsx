import { createServerClient } from "@/lib/supabase-server";
import DocumentsClient from "@/components/documents/DocumentsClient";

export default async function DocumentsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return <DocumentsClient initialDocuments={documents ?? []} userId={user!.id} />;
}

