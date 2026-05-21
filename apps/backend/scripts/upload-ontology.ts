#!/usr/bin/env tsx
/**
 * Upload the Layer 1 dental ontology files to ElevenLabs workspace as shared
 * knowledge-base documents. Idempotent: re-uploads only if the local file
 * content hash differs from the cached upload.
 *
 * Output: prints a JSON object mapping filename -> EL document_id. Paste this
 * into Vercel env as ELEVENLABS_ONTOLOGY_KB_DOC_IDS so the provisioning
 * route picks it up on the next deploy.
 *
 * Usage:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm tsx apps/backend/scripts/upload-ontology.ts
 *
 * Local cache file: apps/backend/.ontology-uploaded.json (gitignored).
 * Cache shape: { [filename]: { contentHash: string; documentId: string } }
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ONTOLOGY_DIR = join(REPO_ROOT, "apps", "backend", "ontology");
const CACHE_PATH = join(REPO_ROOT, "apps", "backend", ".ontology-uploaded.json");

const ONTOLOGY_FILES = [
  "services.md",
  "triage.md",
  "scripts.md",
  "emergency-keywords.md",
  "consent.md",
];

interface CacheEntry {
  contentHash: string;
  documentId: string;
}
type Cache = Record<string, CacheEntry>;

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY missing in environment");
  process.exit(1);
}

async function loadCache(): Promise<Cache> {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(cache: Cache): Promise<void> {
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

async function uploadDoc(name: string, text: string): Promise<string> {
  const res = await fetch("https://api.elevenlabs.io/v1/convai/knowledge-base/text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey!,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, text }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`upload ${name} failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as { id?: string; document_id?: string };
  const documentId = data.id ?? data.document_id;
  if (!documentId) {
    throw new Error(`upload ${name}: response missing document id`);
  }
  return documentId;
}

async function deleteDoc(documentId: string): Promise<void> {
  // Detach is implicit when we omit the document from agents' knowledge_base;
  // the actual delete frees the workspace slot. Best-effort: a 404 means the
  // doc was already deleted, treat as success.
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/knowledge-base/${documentId}`,
    {
      method: "DELETE",
      headers: { "xi-api-key": apiKey! },
    },
  );
  if (!res.ok && res.status !== 404) {
    console.warn(`  warn: delete of ${documentId} failed: ${res.status}`);
  }
}

const cache = await loadCache();
const result: Record<string, string> = {};

for (const filename of ONTOLOGY_FILES) {
  const path = join(ONTOLOGY_DIR, filename);
  const text = await readFile(path, "utf8");
  const contentHash = createHash("sha256").update(text).digest("hex");
  const cached = cache[filename];

  if (cached && cached.contentHash === contentHash) {
    console.error(`= ${filename}: unchanged (cached doc ${cached.documentId})`);
    result[filename] = cached.documentId;
    continue;
  }

  if (cached) {
    console.error(`~ ${filename}: changed since last upload, replacing`);
    await deleteDoc(cached.documentId);
  } else {
    console.error(`+ ${filename}: new upload`);
  }

  const name = `ontology/${filename}`;
  const documentId = await uploadDoc(name, text);
  cache[filename] = { contentHash, documentId };
  result[filename] = documentId;
  console.error(`  -> ${documentId}`);
}

await saveCache(cache);

// Emit JSON to stdout; everything else went to stderr above.
process.stdout.write(JSON.stringify(result, null, 2) + "\n");

// Helpful one-liner for Vercel env: comma-separated doc IDs in canonical order.
const idsCsv = ONTOLOGY_FILES.map((f) => result[f]).join(",");
console.error("");
console.error("ELEVENLABS_ONTOLOGY_KB_DOC_IDS=" + idsCsv);
