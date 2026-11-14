type ImageStorage = {
  find: (url: string) => Promise<string | null>;
  download: (url: string) => Promise<string>;
};

/** Share downloads across screens; the storage keeps files across app launches. */
export function createPersistentImageCache(storage: ImageStorage) {
  const ready = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  const listeners = new Set<() => void>();

  function resolve(url: string): Promise<string> {
    const cached = ready.get(url);
    if (cached) return Promise.resolve(cached);
    const existing = pending.get(url);
    if (existing) return existing;
    const work = (async () => {
      const uri = await storage.find(url) ?? await storage.download(url);
      ready.set(url, uri);
      for (const listener of listeners) listener();
      return uri;
    })().finally(() => { pending.delete(url); });
    pending.set(url, work);
    return work;
  }

  async function prefetch(urls: string[], shouldContinue = () => true) {
    const queue = [...new Set(urls)];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (next < queue.length && shouldContinue()) {
        // A failed image must not prevent the rest of the library being saved.
        await resolve(queue[next++]).catch(() => {});
      }
    }));
  }

  return {
    resolve, prefetch, peek: (url: string) => ready.get(url) ?? null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
