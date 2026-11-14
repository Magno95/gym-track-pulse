// Nike NCSS: --podium-cds-color-brand-orange resolves to orange-400.
// https://www.nike.com/static/ncss/4.3/dotcom/desktop/css/ncss.it-it.min.css
export const brandOrange = '#FF5000';
const buttonOrange = '#CF4100';

export const palettes = {
  light: {
    background: '#F5F5F5', surface: '#FFFFFF', text: '#111111', secondary: '#666666',
    brand: brandOrange, onBrand: '#FFFFFF', buttonOrange, accent: '#BD3B00', accentSoft: '#FFF0E9',
    separator: '#E5E5E5', inputBorder: '#8A8A8A', danger: '#C72C3C', positive: '#007A52',
    primary: '#111111', onPrimary: '#FFFFFF',
    hero: '#111111', onHero: '#FFFFFF', heroSecondary: '#BDBDBD',
  },
  dark: {
    background: '#0B0B0B', surface: '#191919', text: '#FFFFFF', secondary: '#A8A8A8',
    brand: brandOrange, onBrand: '#FFFFFF', buttonOrange, accent: '#FF8255', accentSoft: '#321A12',
    separator: '#303030', inputBorder: '#777777', danger: '#FF7A87', positive: '#67D5A3',
    primary: '#FFFFFF', onPrimary: '#111111',
    hero: '#111111', onHero: '#FFFFFF', heroSecondary: '#BDBDBD',
  },
};
