import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('native adapter persists photos in Documents and never commits interrupted downloads', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gymtrack-native-images-'));
  const calls = [];
  let outcome = 'ok';
  class Directory {
    constructor(...parts) { this.path = join(...parts.map((part) => part.path ?? part)); }
    create() { mkdirSync(this.path, { recursive: true }); }
  }
  class File extends Directory {
    get uri() { return pathToFileURL(this.path).href; }
    get name() { return basename(this.path); }
    get exists() { return existsSync(this.path); }
    get size() { return this.exists ? statSync(this.path).size : 0; }
    delete() { unlinkSync(this.path); }
    async move(destination) { renameSync(this.path, destination.path); this.path = destination.path; }
    static async downloadFileAsync(url, destination) {
      calls.push(url);
      if (outcome === 'offline') throw new Error('offline');
      writeFileSync(destination.path, outcome === 'empty' ? '' : `image:${url}`);
      if (outcome === 'partial') throw new Error('interrupted');
      return destination;
    }
  }
  globalThis.__gymtrackImageCacheNativeTest = {
    Directory, File, Paths: { document: root },
    CryptoDigestAlgorithm: { SHA256: 'sha256' },
    digestStringAsync: async (algorithm, value) => createHash(algorithm).update(value).digest('hex'),
    Image: { resolveAssetSource: (id) => ({ uri: id === 1 ? 'http://localhost:8081/assets/squat.webp?hash=abc' : 'file:///app/assets/squat.webp' }) },
  };
  // Use the real adapter with filesystem-backed stand-ins for the native-only modules.
  const nativeUrl = new URL('../src/image-cache.ts', import.meta.url);
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.split('?')[0] === nativeUrl.href) {
        if (['expo-crypto', 'expo-file-system', 'react-native'].includes(specifier)) return { url: 'gymtrack-test:native-images', shortCircuit: true };
        if (specifier === './persistent-image-cache') return { url: new URL('../src/persistent-image-cache.ts', import.meta.url).href, shortCircuit: true };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'gymtrack-test:native-images') return { format: 'module', shortCircuit: true,
        source: 'export const { Directory, File, Paths, Image, CryptoDigestAlgorithm, digestStringAsync } = globalThis.__gymtrackImageCacheNativeTest;' };
      return next(url, context);
    },
  });
  t.after(() => { hooks.deregister(); delete globalThis.__gymtrackImageCacheNativeTest; rmSync(root, { recursive: true, force: true }); });
  const { imageCache, remoteImageSource } = await import(`${nativeUrl}?first`);
  const photo = 'https://images.example.test/alice/photo.webp';
  const [uri, sameUri] = await Promise.all([imageCache.resolve(photo), imageCache.resolve(photo)]);
  assert.equal(uri, sameUri);
  assert.equal(calls.length, 1);
  assert.equal(readFileSync(fileURLToPath(uri), 'utf8'), `image:${photo}`);
  assert.ok(fileURLToPath(uri).startsWith(join(root, 'downloaded-exercise-images')));

  outcome = 'offline';
  const reopened = (await import(`${nativeUrl}?reopened`)).imageCache;
  assert.equal(await reopened.resolve(photo), uri);
  assert.equal(calls.length, 1);

  const other = `${photo}?replacement=1`;
  outcome = 'partial';
  await assert.rejects(imageCache.resolve(other), /interrupted/);
  assert.equal(readdirSync(join(root, 'downloaded-exercise-images')).length, 1);
  outcome = 'empty';
  await assert.rejects(imageCache.resolve(other), /vuota/);
  assert.equal(readdirSync(join(root, 'downloaded-exercise-images')).length, 1);
  outcome = 'ok';
  assert.notEqual(await imageCache.resolve(other), uri);
  assert.equal(readdirSync(join(root, 'downloaded-exercise-images')).length, 2);

  assert.ok(remoteImageSource(1).uri.startsWith('http://localhost:8081/'));
  assert.equal(remoteImageSource(2), null);
  assert.equal(remoteImageSource({ uri: 'file:///phone/photo.webp' }), null);
  assert.equal(remoteImageSource(null), null);
  assert.equal(remoteImageSource([{ uri: photo }]), null);
});
