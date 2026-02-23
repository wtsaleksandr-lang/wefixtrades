import { getWidgetTheme, type WidgetThemeConfig } from '@/theme/widgetTheme';

export function getEffectiveTheme(overrides?: WidgetThemeConfig, primaryColor?: string) {
  return getWidgetTheme(overrides, primaryColor);
}
