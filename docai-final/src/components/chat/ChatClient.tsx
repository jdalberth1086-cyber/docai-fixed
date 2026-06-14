"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatSession, ChatMessage, DocumentReference } from "@/types";
import { createClient } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  sessions: ChatSession[];
  initialMessages: ChatMessage[];
  activeSessionId: string | null;
  userId: string;
}

export default function ChatClient({ sessions, initialMessages, activeSessionId, userId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [sessionList, setSessionList] = useState<ChatSession[]>(sessions);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(activeSessionId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);

    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      session_id: currentSessionId || "",
      user_id: userId,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, sessionId: currentSessionId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      if (!currentSessionId && data.sessionId) {
        setCurrentSessionId(data.sessionId);
        router.replace(`/dashboard/chat?session=${data.sessionId}`);
        // Add new session to list
        const newTitle = trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : "");
        const newSession: ChatSession = {
          id: data.sessionId,
          user_id: userId,
          title: newTitle,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setSessionList((prev) => [newSession, ...prev]);
      } else {
        // Update session updated_at
        setSessionList((prev) =>
          prev.map((s) => s.id === currentSessionId ? { ...s, updated_at: new Date().toISOString() } : s)
        );
      }

      const assistantMsg: ChatMessage = {
        id: "temp-ai-" + Date.now(),
        session_id: data.sessionId,
        user_id: userId,
        role: "assistant",
        content: data.answer,
        references: data.references,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        id: "err-" + Date.now(),
        session_id: currentSessionId || "",
        user_id: userId,
        role: "assistant",
        content: `❌ Error: ${err instanceof Error ? err.message : "Error desconocido"}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSession(session: ChatSession) {
    setCurrentSessionId(session.id);
    router.replace(`/dashboard/chat?session=${session.id}`);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  }

  async function newChat() {
    setCurrentSessionId(null);
    setMessages([]);
    router.replace("/dashboard/chat");
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("¿Eliminar esta conversación?")) return;
    await supabase.from("chat_sessions").delete().eq("id", sessionId);
    setSessionList((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) newChat();
  }

  return (
    <div className="flex h-full">
      {/* Chat History Sidebar */}
      <div className="w-52 flex flex-col h-full shrink-0" style={{ borderRight: "1px solid var(--border)", background: "var(--bg)" }}>
        <div className="p-3">
          <button onClick={newChat} className="btn-primary w-full flex items-center justify-center gap-2 text-xs py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessionList.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "var(--text-dim)" }}>Sin conversaciones</p>
          ) : (
            sessionList.map((session) => (
              <div key={session.id}
                className="group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-all duration-150"
                style={{
                  background: currentSessionId === session.id ? "var(--gold)/10" : "transparent",
                  border: currentSessionId === session.id ? "1px solid var(--gold)/20" : "1px solid transparent",
                }}
                onClick={() => loadSession(session)}>
                <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>💬</span>
                <p className="flex-1 text-xs truncate" style={{
                  color: currentSessionId === session.id ? "var(--gold)" : "var(--text-muted)"
                }}>
                  {session.title}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                  style={{ color: "var(--text-dim)" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="text-5xl mb-5">🤖</div>
                <h2 className="font-display text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
                  Pregunta sobre tus documentos
                </h2>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  La IA responderá exclusivamente con información de tus PDFs cargados, citando siempre la fuente.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--gold)/15", border: "1px solid var(--gold)/30" }}>
                    <span className="text-xs">🤖</span>
                  </div>
                )}

                <div className={`max-w-2xl ${msg.role === "user" ? "flex flex-col items-end" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm"
                      style={{ background: "var(--gold)/15", border: "1px solid var(--gold)/20", color: "var(--text)" }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div>
                      <div className="prose-chat">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      {/* References */}
                      {msg.references && msg.references.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                            📎 Fuentes utilizadas:
                          </p>
                          {(msg.references as DocumentReference[]).map((ref, i) => (
                            <div key={i}>
                              <button
                                onClick={() => setExpandedRef(expandedRef === `${msg.id}-${i}` ? null : `${msg.id}-${i}`)}
                                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg w-full text-left transition-all duration-150"
                                style={{
                                  background: "var(--bg-hover)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text-muted)",
                                }}>
                                <span style={{ color: "var(--gold)" }}>📄</span>
                                <span className="font-medium truncate" style={{ color: "var(--text)" }}>{ref.doc_name}</span>
                                <span className="shrink-0">· Pág. {ref.page}</span>
                                <span className="ml-auto shrink-0 font-mono" style={{ color: "var(--gold)" }}>
                                  {Math.round(ref.score * 100)}%
                                </span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                  className="shrink-0 transition-transform"
                                  style={{ transform: expandedRef === `${msg.id}-${i}` ? "rotate(180deg)" : "rotate(0)" }}>
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </button>

                              {expandedRef === `${msg.id}-${i}` && (
                                <div className="mt-1 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
                                  style={{
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderLeft: "2px solid var(--gold)",
                                    color: "var(--text-muted)",
                                    fontFamily: "'DM Sans', sans-serif",
                                  }}>
                                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--gold)" }}>
                                    Fragmento — {ref.doc_name}, p. {ref.page}
                                  </p>
                                  <p>{ref.chunk_text}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-xs mt-1.5" style={{ color: "var(--text-dim)" }}>
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                    style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    Tú
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--gold)/15", border: "1px solid var(--gold)/30" }}>
                <span className="text-xs">🤖</span>
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "var(--gold)", animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end p-3 rounded-xl" style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Pregunta algo sobre tus documentos… (Enter para enviar)"
                rows={1}
                disabled={loading}
                className="flex-1 bg-transparent resize-none focus:outline-none text-sm"
                style={{
                  color: "var(--text)",
                  minHeight: "24px",
                  maxHeight: "160px",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-all duration-200 active:scale-95"
                style={{
                  background: input.trim() && !loading ? "var(--gold)" : "var(--border)",
                  color: input.trim() && !loading ? "var(--bg)" : "var(--text-dim)",
                }}>
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                )}
              </button>
            </div>
            <p className="text-center text-xs mt-2" style={{ color: "var(--text-dim)" }}>
              Las respuestas se basan exclusivamente en tus documentos cargados
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

