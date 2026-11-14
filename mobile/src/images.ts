import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { getSupabase } from './supabase';
import { requireOwner } from './data/identity';
import type { ImageUpload } from './data/model';
import { outbox } from './data/native-store';

export async function chooseImage(owner: string): Promise<ImageUpload | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (result.canceled) return null;
  requireOwner(owner);
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('Scegli un’immagine fino a 5 MB.');
  const directory = new Directory(Paths.document, 'exercise-images', owner);
  directory.create({ intermediates: true, idempotent: true });
  const id = randomUUID();
  const destination = new File(directory, `${id}.original`);
  new File(asset.uri).copy(destination);
  return { uri: destination.uri, width: asset.width, height: asset.height, path: `${owner}/uploads/${id}.webp` };
}
export function publicImageUrl(path: string) { return getSupabase().storage.from('exercise-images').getPublicUrl(path).data.publicUrl; }
export async function uploadExerciseImage(image: ImageUpload, owner: string, signal: AbortSignal) {
  if (!image.path.startsWith(`${owner}/`)) throw new Error('Immagine di un altro account.');
  for (const max of [960, 240]) {
    requireOwner(owner); signal.throwIfAborted();
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const context = ImageManipulator.manipulate(image.uri);
    context.resize({ width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) });
    const rendered = await context.renderAsync();
    const resized = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
    const bytes = await new File(resized.uri).arrayBuffer();
    requireOwner(owner); signal.throwIfAborted();
    const path = max === 240 ? image.path.replace(/\.webp$/, '-thumb.webp') : image.path;
    const { error } = await getSupabase().storage.from('exercise-images').upload(path, bytes, { upsert: true, contentType: 'image/webp' });
    if (error) throw error;
  }
}
export async function cleanupImage(url: string, owner: string, signal: AbortSignal) {
  requireOwner(owner);
  let base: URL;
  let target: URL;
  try { base = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!); target = new URL(url); }
  catch { return; }
  const prefix = `/storage/v1/object/public/exercise-images/${owner}/`;
  if (base.origin !== target.origin || !target.pathname.startsWith(prefix)) return;
  if (outbox.pending(owner).some((op) => op.change.type === 'save_exercise' && op.change.exercise.image_url === url)) throw new Error('Immagine ancora usata da una modifica in attesa.');
  const { data, error } = await getSupabase().from('exercises').select('id').eq('user_id', owner).eq('image_url', url).limit(1).abortSignal(signal);
  if (error) throw error;
  if (data.length) return;
  requireOwner(owner);
  const path = decodeURIComponent(target.pathname.slice('/storage/v1/object/public/exercise-images/'.length));
  const result = await getSupabase().storage.from('exercise-images').remove([path, path.replace(/\.webp$/, '-thumb.webp')]);
  if (result.error) throw result.error;
}
