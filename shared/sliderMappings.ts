export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  unitSuffix: string;
}

const SLIDER_CONFIGS: Record<string, SliderConfig> = {
  sq_ft: { min: 100, max: 5000, step: 50, unitSuffix: 'sq ft' },
  sqft: { min: 100, max: 5000, step: 50, unitSuffix: 'sq ft' },
  square_feet: { min: 100, max: 5000, step: 50, unitSuffix: 'sq ft' },
  linear_ft: { min: 10, max: 500, step: 5, unitSuffix: 'linear ft' },
  linear_feet: { min: 10, max: 500, step: 5, unitSuffix: 'linear ft' },
  bedrooms: { min: 1, max: 8, step: 1, unitSuffix: 'bedrooms' },
  bathrooms: { min: 1, max: 6, step: 1, unitSuffix: 'bathrooms' },
  rooms: { min: 1, max: 12, step: 1, unitSuffix: 'rooms' },
  windows: { min: 1, max: 30, step: 1, unitSuffix: 'windows' },
  floors: { min: 1, max: 4, step: 1, unitSuffix: 'floors' },
  stories: { min: 1, max: 4, step: 1, unitSuffix: 'stories' },
  distance_km: { min: 0, max: 100, step: 5, unitSuffix: 'km' },
  distance_mi: { min: 0, max: 100, step: 5, unitSuffix: 'mi' },
  distance: { min: 0, max: 100, step: 5, unitSuffix: 'mi' },
  quantity: { min: 1, max: 50, step: 1, unitSuffix: '' },
  hours: { min: 1, max: 24, step: 0.5, unitSuffix: 'hrs' },
  acres: { min: 0.25, max: 10, step: 0.25, unitSuffix: 'acres' },
  trees: { min: 1, max: 20, step: 1, unitSuffix: 'trees' },
  vehicles: { min: 1, max: 5, step: 1, unitSuffix: '' },
  items: { min: 1, max: 50, step: 1, unitSuffix: '' },
  people: { min: 1, max: 50, step: 1, unitSuffix: 'people' },
  guests: { min: 10, max: 300, step: 10, unitSuffix: 'guests' },
};

export function getSliderConfig(fieldType: string): SliderConfig | null {
  const normalized = fieldType.toLowerCase().replace(/[\s-]/g, '_');
  return SLIDER_CONFIGS[normalized] || null;
}

export function shouldUseSlider(fieldType: string, useSlidersGlobal: boolean): boolean {
  if (!useSlidersGlobal) return false;
  return getSliderConfig(fieldType) !== null;
}

export function getDefaultSliderConfig(): SliderConfig {
  return { min: 1, max: 100, step: 1, unitSuffix: '' };
}
