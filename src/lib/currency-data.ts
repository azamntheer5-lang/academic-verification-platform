// Display metadata for currency instruments shown in the terminal dashboard.
// The live price data itself comes from the WebSocket stream service (port 3003)
// and the /api/currencies REST snapshot. This file only holds presentation info.

export type CurrencyCategory = 'forex' | 'crypto' | 'metal'

export interface CurrencyMeta {
  symbol: string
  name: string // Arabic display name
  short: string // short label used in tight layouts
  category: CurrencyCategory
  unit: string // currency / unit code shown next to the price
  flag: string // emoji flag or glyph
  decimals: number
}

export const CURRENCY_META: CurrencyMeta[] = [
  { symbol: 'USD/SAR', name: 'دولار أمريكي · ريال سعودي', short: 'ريال سعودي', category: 'forex', unit: 'SAR', flag: '🇸🇦', decimals: 4 },
  { symbol: 'USD/AED', name: 'دولار أمريكي · درهم إماراتي', short: 'درهم إماراتي', category: 'forex', unit: 'AED', flag: '🇦🇪', decimals: 4 },
  { symbol: 'USD/EGP', name: 'دولار أمريكي · جنيه مصري', short: 'جنيه مصري', category: 'forex', unit: 'EGP', flag: '🇪🇬', decimals: 3 },
  { symbol: 'USD/QAR', name: 'دولار أمريكي · ريال قطري', short: 'ريال قطري', category: 'forex', unit: 'QAR', flag: '🇶🇦', decimals: 4 },
  { symbol: 'USD/KWD', name: 'دولار أمريكي · دينار كويتي', short: 'دينار كويتي', category: 'forex', unit: 'KWD', flag: '🇰🇼', decimals: 4 },
  { symbol: 'USD/TRY', name: 'دولار أمريكي · ليرة تركية', short: 'ليرة تركية', category: 'forex', unit: 'TRY', flag: '🇹🇷', decimals: 3 },
  { symbol: 'EUR/USD', name: 'يورو · دولار أمريكي', short: 'يورو', category: 'forex', unit: 'USD', flag: '🇪🇺', decimals: 4 },
  { symbol: 'GBP/USD', name: 'جنيه إسترليني · دولار', short: 'إسترليني', category: 'forex', unit: 'USD', flag: '🇬🇧', decimals: 4 },
  { symbol: 'USD/JPY', name: 'دولار أمريكي · ين ياباني', short: 'ين ياباني', category: 'forex', unit: 'JPY', flag: '🇯🇵', decimals: 2 },
  { symbol: 'XAU/USD', name: 'الذهب · أونصة', short: 'ذهب', category: 'metal', unit: 'USD', flag: '🥇', decimals: 2 },
  { symbol: 'BTC/USD', name: 'بيتكوين · دولار', short: 'بيتكوين', category: 'crypto', unit: 'USD', flag: '₿', decimals: 1 },
  { symbol: 'ETH/USD', name: 'إيثيريوم · دولار', short: 'إيثيريوم', category: 'crypto', unit: 'USD', flag: 'Ξ', decimals: 2 },
]

export const META_BY_SYMBOL: Record<string, CurrencyMeta> = Object.fromEntries(
  CURRENCY_META.map((m) => [m.symbol, m]),
)

export const CATEGORY_LABELS: Record<CurrencyCategory, string> = {
  forex: 'فوركس',
  crypto: 'عملات رقمية',
  metal: 'معادن',
}

export function formatPrice(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
