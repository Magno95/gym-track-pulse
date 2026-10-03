import { supabase } from "@/integrations/supabase/client";
import { generatedThumbnailUrl } from "@/lib/generatedExerciseImages";

export function imagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const base = new URL(import.meta.env.VITE_SUPABASE_URL);
    const parsed = new URL(url);
    const prefix = "/storage/v1/object/public/exercise-images/";
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch { return null; }
}
export function thumbnailPath(path: string): string {
  return path.split("/").length === 3 && path.endsWith(".webp") ? path.replace(/\.webp$/, "-thumb.webp") : path;
}
export function thumbnailUrl(url: string): string {
  const generated = generatedThumbnailUrl(url);
  if (generated) return generated;
  const path = imagePath(url);
  return path ? supabase.storage.from("exercise-images").getPublicUrl(thumbnailPath(path)).data.publicUrl : url;
}

export async function resizeExerciseImage(file: File, maxSide: number): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a JPEG, PNG or WebP image up to 5 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize images.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((data) => data ? resolve(data) : reject(new Error("Could not process the image.")), "image/webp", 0.8));
    if (blob.type !== "image/webp") throw new Error("This browser cannot export WebP images.");
    return new File([blob], "exercise.webp", { type: "image/webp" });
  } finally { bitmap.close(); }
}
