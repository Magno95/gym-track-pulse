import type { Outbox } from './outbox.ts';
import type { Operation } from './model.ts';

const running = new Map<string, Promise<void>>();
export function synchronize(store: Outbox, owner: string, execute: (operation: Operation) => Promise<void>, force = false) {
  const existing = running.get(owner);
  if (existing) return existing;
  const work = (async () => {
    for (const operation of store.pending(owner)) {
      store.assertOwner(owner);
      if (!force && (operation.permanent || operation.nextAttempt > Date.now())) {
        if (operation.change.type === 'delete_image') continue;
        break;
      }
      try {
        await execute(operation); store.assertOwner(owner);
        const change = operation.change;
        const oldImage = change.type === 'save_exercise' ? change.previousImage : change.type === 'delete_exercise' ? change.imageUrl : null;
        if (oldImage && (change.type !== 'save_exercise' || oldImage !== change.exercise.image_url)
          && !store.pending(owner).some((item) => item.id === `${operation.id}:image`)) {
          store.enqueue(owner, { type: 'delete_image', imageUrl: oldImage }, `${operation.id}:image`);
        }
        store.acknowledge(operation);
      }
      catch (error) {
        // A new account must never acknowledge or mutate the old account's pending work.
        store.assertOwner(owner);
        store.failed(operation, error);
        if (operation.change.type !== 'delete_image') break;
      }
    }
  })().finally(() => { running.delete(owner); });
  running.set(owner, work);
  return work;
}
