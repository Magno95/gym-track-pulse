import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createPersistentImageCache } from '../src/persistent-image-cache.ts';

const photo = 'https://images.example.test/alice/photo.webp';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'gymtrack-images-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = (url) => join(directory, createHash('sha256').update(url).digest('hex'));
  let downloads = 0;
  let online = true;
  const storage = {
    async find(url) {
      try { return (await readFile(path(url))).length ? pathToFileURL(path(url)).href : null; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async download(url) {
      downloads++;
      if (!online) throw new Error('offline');
      await writeFile(path(url), `image:${url}`);
      return pathToFileURL(path(url)).href;
    },
  };
  return { storage, path, downloads: () => downloads, offline: () => { online = false; }, online: () => { online = true; } };
}

test('list, history and detail share one download, including simultaneous requests', async (t) => {
  const f = await fixture(t);
  const cache = createPersistentImageCache(f.storage);
  assert.equal(cache.peek(photo), null);
  const images = await Promise.all(Array.from({ length: 10 }, () => cache.resolve(photo)));
  assert.ok(images.every((uri) => uri === images[0] && uri.startsWith('file:')));
  assert.equal(cache.peek(photo), images[0]);
  assert.equal(await cache.resolve(photo), images[0]);
  assert.equal(f.downloads(), 1);
});

test('reopening the app offline reads the saved file without a download or revalidation', async (t) => {
  const f = await fixture(t);
  const initial = await createPersistentImageCache(f.storage).resolve(photo);
  f.offline();
  const reopened = createPersistentImageCache(f.storage);
  assert.equal(await reopened.resolve(photo), initial);
  assert.equal(f.downloads(), 1);
});

test('a replacement photo gets its own file and an unchanged URL is reused', async (t) => {
  const f = await fixture(t);
  const cache = createPersistentImageCache(f.storage);
  const initial = await cache.resolve(photo);
  const replacement = await cache.resolve(`${photo}?v=2`);
  assert.notEqual(initial, replacement);
  assert.equal(await cache.resolve(photo), initial);
  assert.equal(f.downloads(), 2);
});

test('a failed first download is shared, then can be retried when online', async (t) => {
  const f = await fixture(t);
  const cache = createPersistentImageCache(f.storage);
  f.offline();
  const failures = await Promise.allSettled([cache.resolve(photo), cache.resolve(photo)]);
  assert.ok(failures.every(({ status }) => status === 'rejected'));
  assert.equal(cache.peek(photo), null);
  assert.equal(f.downloads(), 1);
  f.online();
  assert.ok((await cache.resolve(photo)).startsWith('file:'));
  assert.equal(f.downloads(), 2);
});

test('empty files left by an interrupted download are downloaded again', async (t) => {
  const f = await fixture(t);
  await writeFile(f.path(photo), '');
  await createPersistentImageCache(f.storage).resolve(photo);
  assert.equal(f.downloads(), 1);
});

test('a mounted image is notified when reconnection preloads a previously unavailable photo', async (t) => {
  const f = await fixture(t);
  const cache = createPersistentImageCache(f.storage);
  const snapshots = [];
  const unsubscribe = cache.subscribe(() => snapshots.push(cache.peek(photo)));
  f.offline();
  await assert.rejects(cache.resolve(photo), /offline/);
  assert.deepEqual(snapshots, []);
  f.online();
  await cache.prefetch([photo]);
  assert.deepEqual(snapshots, [cache.peek(photo)]);
  assert.ok(snapshots[0].startsWith('file:'));
  unsubscribe();
  await cache.resolve(`${photo}?other=1`);
  assert.equal(snapshots.length, 1);
});

test('preloading saves the whole library for offline use, including images never shown', async (t) => {
  const f = await fixture(t);
  const urls = Array.from({ length: 12 }, (_, i) => `${photo}?photo=${i}`);
  await createPersistentImageCache(f.storage).prefetch([...urls, ...urls]);
  assert.equal(f.downloads(), urls.length);
  f.offline();
  const reopened = createPersistentImageCache(f.storage);
  for (const url of urls) assert.ok((await reopened.resolve(url)).startsWith('file:'));
  assert.equal(f.downloads(), urls.length);
});

test('preloading limits downloads and stops scheduling when the screen account changes', async () => {
  let active = 0;
  let maximum = 0;
  let started = 0;
  let cancelled = false;
  const cache = createPersistentImageCache({
    find: async () => null,
    async download(url) {
      started++;
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      cancelled = true;
      return `file://${url}`;
    },
  });
  await cache.prefetch(Array.from({ length: 20 }, (_, i) => `${photo}?photo=${i}`), () => !cancelled);
  assert.equal(maximum, 3);
  assert.equal(started, 3);
});
