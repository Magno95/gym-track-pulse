import { useColorScheme } from 'react-native';
import { palettes } from './colors';

export function usePalette() {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}
