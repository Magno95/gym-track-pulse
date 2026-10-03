const illustrations = [
  ["Farmer Carry", "farmer-carry"],
  ["Alzate manubri", "alzate-manubri"],
  ["Pectoral Machine", "pectoral-machine"],
  ["Panca Inclinata Manubri", "panca-inclinata-manubri"],
  ["Pulley", "pulley"],
  ["Squat", "squat"],
  ["Polpacci", "polpacci"],
  ["Affondi Bulgari con rialzo", "affondi-bulgari-con-rialzo"],
  ["Seated leg lift", "seated-leg-lift"],
  ["Polpacci Isometrics", "polpacci-isometrics"],
  ["Wall Ball", "wall-ball"],
  ["Jump Squat", "jump-squat"],
  ["Air bike", "air-bike"],
  ["Navy Seal Burpees", "navy-seal-burpees"],
] as const;

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const generatedExerciseImages = illustrations.map(([name, filename]) => ({
  name,
  image: `/exercise-images/${filename}.webp`,
  thumbnail: `/exercise-images/${filename}-thumb.webp`,
}));

const imagesByName = new Map(generatedExerciseImages.map(({ name, image }) => [normalizeName(name), image]));
const thumbnailsByImage = new Map(generatedExerciseImages.map(({ image, thumbnail }) => [image, thumbnail]));

/** Uploaded images take precedence over the bundled illustrations. */
export function exerciseImageUrl(name: string, uploadedUrl?: string | null): string | null {
  return uploadedUrl?.trim() || imagesByName.get(normalizeName(name)) || null;
}

export function generatedThumbnailUrl(imageUrl: string): string | null {
  return thumbnailsByImage.get(imageUrl) ?? null;
}
