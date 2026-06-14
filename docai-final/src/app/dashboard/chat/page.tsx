import { createServerClient } from "@/lib/supabase-server";
import ChatClient from "@/components/chat/ChatClient";
import type { ChatMessage, ChatSession } from "@/types";

interface Props {
  searchParams: Promise<{ session?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false });

  let initialMessages: ChatMessage[] = [];
  const activeSessionId = params.session ?? null;

  if (activeSessionId) {
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true });
    initialMessages = (messages as ChatMessage[]) ?? [];
  }

  return (
    <ChatClient
      sessions={(sessions as ChatSession[]) ?? []}
      initialMessages={initialMessages}
      activeSessionId={activeSessionId}
      userId={user!.id}
    />
  );
}

