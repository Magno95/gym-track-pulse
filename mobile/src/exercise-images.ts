import type { ImageSourcePropType } from 'react-native';
import type { Exercise } from './data/exercises';
import farmerCarry from '../assets/exercises/farmer-carry-thumb.webp';
import alzateManubri from '../assets/exercises/alzate-manubri-thumb.webp';
import pectoralMachine from '../assets/exercises/pectoral-machine-thumb.webp';
import pancaInclinata from '../assets/exercises/panca-inclinata-manubri-thumb.webp';
import pulley from '../assets/exercises/pulley-thumb.webp';
import squat from '../assets/exercises/squat-thumb.webp';
import polpacci from '../assets/exercises/polpacci-thumb.webp';
import affondi from '../assets/exercises/affondi-bulgari-con-rialzo-thumb.webp';
import legLift from '../assets/exercises/seated-leg-lift-thumb.webp';
import polpacciIsometrics from '../assets/exercises/polpacci-isometrics-thumb.webp';
import wallBall from '../assets/exercises/wall-ball-thumb.webp';
import jumpSquat from '../assets/exercises/jump-squat-thumb.webp';
import airBike from '../assets/exercises/air-bike-thumb.webp';
import burpees from '../assets/exercises/navy-seal-burpees-thumb.webp';

// Keep the illustrations already used by the web app available without a network request.
const images: Record<string, ImageSourcePropType> = {
  'farmer carry': farmerCarry,
  'alzate manubri': alzateManubri,
  'pectoral machine': pectoralMachine,
  'panca inclinata manubri': pancaInclinata,
  pulley, squat, polpacci,
  'affondi bulgari con rialzo': affondi,
  'seated leg lift': legLift,
  'polpacci isometrics': polpacciIsometrics,
  'wall ball': wallBall,
  'jump squat': jumpSquat,
  'air bike': airBike,
  'navy seal burpees': burpees,
};
export function exerciseImage(exercise: Pick<Exercise, 'name' | 'image_url'>): ImageSourcePropType | null {
  if (exercise.image_url?.startsWith('https://')) return { uri: exercise.image_url };
  return images[exercise.name.trim().replace(/\s+/g, ' ').toLowerCase()] ?? null;
}
