/**
 * pinecone.ts — Cliente Pinecone para vectores de documentos
 */
import { Pinecone } from "@pinecone-database/pinecone";


let _pinecone: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!_pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY environment variable is not set");
    }
    _pinecone = new Pinecone({ apiKey });
  }
  return _pinecone;
}

const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "Orbit-index";
const UPSERT_BATCH_SIZE = 100;

export interface VectorMetadata {
  userId: string;
  documentId: string;
  docName: string;
  chunkIndex: number;
  pageNumber: number;
  chunkText: string;
}

function getIndex() {
  return getPinecone().index(INDEX_NAME);
}

async function pineconeRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pinecone] ${label} intento ${i}/${maxAttempts} falló: ${msg}`);
      if (i < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
  }
  throw lastErr;
}

export async function upsertVectors(
  vectors: Array<{
    id: string;
    values: number[];
    metadata: VectorMetadata;
  }>
): Promise<void> {
  if (vectors.length === 0) return;

  const firstLen = vectors[0].values.length;
  for (const v of vectors) {
    if (!v.values || v.values.length === 0) {
      throw new Error(`Vector ${v.id} tiene values vacíos`);
    }
    if (v.values.length !== firstLen) {
      throw new Error(
        `Inconsistencia de dimensiones: esperaba ${firstLen}, vector ${v.id} tiene ${v.values.length}`
      );
    }
  }

  console.log(`[pinecone] Upsertando ${vectors.length} vectores (dim=${firstLen})`);

  const byUser = new Map<string, typeof vectors>();
  for (const v of vectors) {
    const ns = v.metadata.userId;
    if (!byUser.has(ns)) byUser.set(ns, []);
    byUser.get(ns)!.push(v);
  }

  for (const [userId, userVectors] of byUser.entries()) {
    const ns = getIndex().namespace(userId);
    const totalBatches = Math.ceil(userVectors.length / UPSERT_BATCH_SIZE);

    for (let i = 0; i < userVectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = userVectors.slice(i, i + UPSERT_BATCH_SIZE);
      const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;

      await pineconeRetry(
        () => ns.upsert(batch as any),
        `upsert batch ${batchNum}/${totalBatches} user=${userId.slice(0, 8)}`
      );
    }
  }

  console.log(`[pinecone] Upsert completado: ${vectors.length} vectores`);
}

export async function querySimilarChunks(
  queryVector: number[],
  userId: string,
  topK: number = 5
): Promise<
  Array<{
    id: string;
    score: number;
    metadata: VectorMetadata;
  }>
> {
  const ns = getIndex().namespace(userId);

  const result = await pineconeRetry(
    () =>
      ns.query({
        vector: queryVector,
        topK,
        includeMetadata: true,
      }),
    `query topK=${topK} user=${userId.slice(0, 8)}`
  );

  return (result.matches ?? [])
    .filter((m) => m.metadata != null && m.score != null && m.score > 0.3)
    .map((m) => ({
      id: m.id,
      score: m.score ?? 0,
      metadata: m.metadata as unknown as VectorMetadata,
    }));
}

export async function deleteDocumentVectors(
  documentId: string,
  userId: string,
  pineconeIds?: string[]
): Promise<void> {
  console.log(
    `[pinecone] Borrando vectores documentId=${documentId} user=${userId.slice(0, 8)}`
  );

  const ns = getIndex().namespace(userId);

  if (pineconeIds && pineconeIds.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < pineconeIds.length; i += BATCH) {
      const batch = pineconeIds.slice(i, i + BATCH);
      await pineconeRetry(
        () => ns.deleteMany(batch),
        `deleteMany batch ${Math.floor(i / BATCH) + 1}`
      );
    }
    console.log(
      `[pinecone] Borrados ${pineconeIds.length} vectores de documentId=${documentId}`
    );
    return;
  }

  try {
    await pineconeRetry(
      async () => {
        await ns.deleteMany({
          filter: { documentId: { $eq: documentId } },
        } as unknown as string[]);
      },
      `deleteMany filter documentId=${documentId}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[pinecone] deleteDocumentVectors con filtro falló (no crítico): ${msg}`
    );
  }
}