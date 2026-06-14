// ─── Tipos existentes (sin cambios) ────────────────────────────────────────

export type DocumentStatus = "pending" | "processing" | "ready" | "error";

export interface Document {
  id: string;
  user_id: string;
  name: string;
  original_name: string;
  storage_path: string;
  file_size: number | null;
  page_count: number | null;
  status: DocumentStatus;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentReference {
  document_id: string;
  doc_name: string;
  page: number;
  chunk_text: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  references?: DocumentReference[];
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  user_id: string;
  pinecone_id: string;
  chunk_index: number;
  page_number: number;
  chunk_text: string;
}

// ─── Nuevos tipos: Módulo de Tareas Escolares ───────────────────────────────

export type TareaStatus = "recibido" | "revisado" | "devuelto";

export interface Tarea {
  id: string;
  /** Nombre completo del estudiante (sin login) */
  estudiante_nombre: string;
  /** Número de documento / cédula del estudiante */
  estudiante_documento: string;
  /** Número WhatsApp del estudiante (formato: 573001234567) */
  estudiante_whatsapp: string | null;
  /** Correo electrónico del estudiante (opcional) */
  estudiante_email: string | null;
  /** Nombre de la materia o asignatura */
  materia: string;
  /** Descripción o título de la tarea */
  descripcion: string | null;
  /** Path en Supabase Storage */
  storage_path: string;
  /** Nombre original del archivo */
  original_name: string;
  /** Tamaño del archivo en bytes */
  file_size: number | null;
  /** Estado de la tarea */
  status: TareaStatus;
  /** Fecha y hora exacta de recepción */
  recibido_en: string;
  /** Comentarios del administrador */
  comentario_admin: string | null;
  /** ID del administrador que revisó */
  revisado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface TareaSubmitPayload {
  estudianteNombre: string;
  estudianteDocumento: string;
  estudianteWhatsapp?: string;
  estudianteEmail?: string;
  materia: string;
  descripcion?: string;
}

export interface TareaSubmitResult {
  success: true;
  tareaId: string;
  mensaje: string;
  recibidoEn: string;
  estudiante: string;
  materia: string;
}

