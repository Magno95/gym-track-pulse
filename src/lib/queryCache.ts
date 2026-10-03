import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { getCurrentUserId } from "./authSession";
interface QueryCacheDB extends DBSchema {
  entries: { key: string; value: { key: string; userId: string; data: unknown; updatedAt: number }; indexes: { owner: string } };
}
let databasePromise: Promise<IDBPDatabase<QueryCacheDB>> | undefined;
function db() {
  if (!databasePromise) {
    databasePromise = openDB<QueryCacheDB>("gym-track-read-cache", 1, {
      upgrade(database) { database.createObjectStore("entries", { keyPath: "key" }).createIndex("owner", "userId"); },
      blocking() { void databasePromise?.then((database) => database.close()); databasePromise = undefined; },
      terminated() { databasePromise = undefined; },
    }).catch((error: unknown) => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}
export async function readQueryCache<T>(key: readonly unknown[], userId: string) {
  const entry = await (await db()).get("entries", JSON.stringify(key));
  return entry?.userId === userId && getCurrentUserId() === userId ? { data: entry.data as T, updatedAt: entry.updatedAt } : null;
}
export async function saveQueryCache(key: readonly unknown[], userId: string, data: unknown) {
  if (getCurrentUserId() !== userId) return;
  try {
    const database = await db(); const tx = database.transaction("entries", "readwrite");
    await tx.store.put({ key: JSON.stringify(key), userId, data, updatedAt: Date.now() });
    const entries = await tx.store.index("owner").getAll(userId);
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    for (const entry of entries.slice(30)) await tx.store.delete(entry.key);
    await tx.done;
  } catch { /* Cache is optional; durable mutations use the separate outbox. */ }
}
