import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Image, type ImageSourcePropType, type ImageURISource } from 'react-native';
import { createPersistentImageCache } from './persistent-image-cache';

export function remoteImageSource(source: ImageSourcePropType | null | undefined): ImageURISource | null {
  // Development assets come from Metro; release assets already resolve to local files.
  const resolved = typeof source === 'number' ? Image.resolveAssetSource(source) : source;
  return resolved && typeof resolved === 'object' && 'uri' in resolved && /^https?:\/\//.test(resolved.uri ?? '')
    ? resolved : null;
}

// Documents are persistent: iOS cannot evict these files like its HTTP/disk cache.
// Full URLs are version keys; replacing an uploaded photo already creates a new URL.
const directory = new Directory(Paths.document, 'downloaded-exercise-images');
async function imageFile(url: string) {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, url);
  const extension = new URL(url).pathname.match(/\.(webp|png|jpe?g|gif|heic|heif|avif)$/i)?.[1] ?? 'img';
  return new File(directory, `${digest}.${extension}`);
}

export const imageCache = createPersistentImageCache({
  async find(url) {
    const file = await imageFile(url);
    return file.exists && file.size > 0 ? file.uri : null;
  },
  async download(url) {
    directory.create({ intermediates: true, idempotent: true });
    const file = await imageFile(url);
    const partial = new File(directory, `${file.name}.download`);
    try {
      if (partial.exists) partial.delete();
      await File.downloadFileAsync(url, partial);
      if (!partial.size) throw new Error('Immagine vuota. Riprova.');
      if (file.exists) file.delete();
      await partial.move(file);
      return file.uri;
    } catch (error) {
      if (partial.exists) partial.delete();
      throw error;
    }
  },
});
