import { BrandContext } from "./brandContext";
import { apiClient } from "@/lib/apiClient";

export interface SavedContext {
  id: string;
  label: string;
  context: BrandContext;
  savedAt: string;
}

/** Legacy browser-local store. Kept only as a migration source and as a
 *  read-through cache so the dropdown can render before the API responds. */
const KEY = "dma_saved_contexts";
const MIGRATED_KEY = "dma_saved_contexts_migrated";

function readLocal(): SavedContext[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeLocal(all: SavedContext[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota or private mode — the server copy is authoritative anyway */
  }
}

/** Synchronous cached read, for initial render only. `fetchContexts` is the
 *  source of truth and overwrites this as soon as it resolves. */
export function listSavedContexts(): SavedContext[] {
  return readLocal();
}

/**
 * Load contexts from the server, migrating any browser-local ones on first run.
 *
 * Migration is one-way and one-time: local entries the server doesn't have are
 * pushed up, then a flag is set so a later deletion on another machine doesn't
 * get resurrected from this browser's stale copy.
 */
export async function fetchContexts(): Promise<SavedContext[]> {
  const remote = await apiClient.listContexts();

  if (!localStorage.getItem(MIGRATED_KEY)) {
    const remoteIds = new Set(remote.map(r => r.id));
    const orphans = readLocal().filter(l => !remoteIds.has(l.id));
    if (orphans.length) {
      const uploaded = await Promise.all(
        orphans.map(o =>
          apiClient.putContext(o.id, { label: o.label, context: o.context }).catch(() => null),
        ),
      );
      remote.push(...uploaded.filter((u): u is SavedContext => u !== null));
      remote.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
    }
    try {
      localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }

  writeLocal(remote);
  return remote;
}

export async function saveContext(
  label: string,
  context: BrandContext,
  editingId?: string,
): Promise<SavedContext> {
  const existing = readLocal();
  const id = editingId ?? existing.find(s => s.label === label)?.id ?? crypto.randomUUID();
  const entry = await apiClient.putContext(id, { label, context });

  const all = existing.some(s => s.id === entry.id)
    ? existing.map(s => (s.id === entry.id ? entry : s))
    : [...existing, entry];
  writeLocal(all);
  return entry;
}

export async function deleteContext(id: string): Promise<void> {
  await apiClient.deleteContext(id);
  writeLocal(readLocal().filter(s => s.id !== id));
}

export function loadContextById(id: string): BrandContext | null {
  return readLocal().find(s => s.id === id)?.context ?? null;
}
