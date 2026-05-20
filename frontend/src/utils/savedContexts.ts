import { BrandContext } from "./brandContext";

export interface SavedContext {
  id: string;
  label: string;
  context: BrandContext;
  savedAt: string;
}

const KEY = "dma_saved_contexts";

export function listSavedContexts(): SavedContext[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveContext(label: string, context: BrandContext, editingId?: string): SavedContext {
  const all = listSavedContexts();
  const entry: SavedContext = {
    id: editingId ?? all.find(s => s.label === label)?.id ?? crypto.randomUUID(),
    label,
    context,
    savedAt: new Date().toISOString(),
  };
  const exists = all.some(s => s.id === entry.id);
  const updated = exists
    ? all.map(s => (s.id === entry.id ? entry : s))
    : [...all, entry];
  localStorage.setItem(KEY, JSON.stringify(updated));
  return entry;
}

export function deleteContext(id: string): void {
  const updated = listSavedContexts().filter(s => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(updated));
}

export function loadContextById(id: string): BrandContext | null {
  return listSavedContexts().find(s => s.id === id)?.context ?? null;
}
