// Localized price display based on device locale.
// Prices are App Store / Google Play tier equivalents of each JPY base amount.
// In production with real IAP (RevenueCat), replace formatPrice() with the
// product's localizedPriceString from the store.

const TIERS: Record<number, Record<string, number>> = {
  320: {
    JPY: 320,  USD: 2.99,  EUR: 2.99,  GBP: 2.49,
    KRW: 3900, CNY: 21,    AUD: 4.49,  CAD: 3.99,
    BRL: 14.90, MXN: 59,  TWD: 90,    HKD: 23,   SGD: 3.98,
    VND: 79000, THB: 109, IDR: 49000, PHP: 169,  MYR: 12.90,
    SAR: 11.99, AED: 10.99, TRY: 99.99, ZAR: 55,
    SEK: 33,   NOK: 34,   DKK: 24,   CHF: 2.90,
    PLN: 12.99, CZK: 69,  HUF: 1090, ILS: 11.90, NZD: 4.99, INR: 249,
  },
  480: {
    JPY: 480,  USD: 3.99,  EUR: 3.99,  GBP: 3.49,
    KRW: 5500, CNY: 30,    AUD: 6.49,  CAD: 5.49,
    BRL: 19.90, MXN: 79,  TWD: 120,   HKD: 31,   SGD: 5.48,
    VND: 99000, THB: 139, IDR: 62000, PHP: 219,  MYR: 17.90,
    SAR: 14.99, AED: 14.99, TRY: 129.99, ZAR: 70,
    SEK: 43,   NOK: 44,   DKK: 30,   CHF: 3.90,
    PLN: 17.99, CZK: 89,  HUF: 1490, ILS: 14.90, NZD: 6.49, INR: 329,
  },
  600: {
    JPY: 600,  USD: 4.99,  EUR: 4.99,  GBP: 4.49,
    KRW: 6900, CNY: 38,    AUD: 7.99,  CAD: 6.99,
    BRL: 24.90, MXN: 99,  TWD: 150,   HKD: 38,   SGD: 6.98,
    VND: 125000, THB: 179, IDR: 79000, PHP: 289, MYR: 23.90,
    SAR: 18.99, AED: 18.99, TRY: 159.99, ZAR: 90,
    SEK: 53,   NOK: 55,   DKK: 39,   CHF: 4.90,
    PLN: 21.99, CZK: 119, HUF: 1990, ILS: 19.90, NZD: 7.99, INR: 399,
  },
};

// Prefix symbol for each currency.
const SYMBOLS: Record<string, string> = {
  JPY: '¥',   USD: '$',    EUR: '€',   GBP: '£',  KRW: '₩',
  CNY: '¥',   AUD: 'A$',  CAD: 'CA$', BRL: 'R$', MXN: 'MX$',
  TWD: 'NT$', HKD: 'HK$', SGD: 'S$',
  VND: '₫',   THB: '฿',   IDR: 'Rp ', PHP: '₱',  MYR: 'RM ',
  SAR: '﷼',   AED: 'AED ',TRY: '₺',  ZAR: 'R ',
  SEK: 'kr',  NOK: 'kr',  DKK: 'kr', CHF: 'CHF ',
  PLN: 'zł',  CZK: 'Kč',  HUF: 'Ft', ILS: '₪',  NZD: 'NZ$', INR: '₹',
};

// These currencies have no decimal places in store prices.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'HUF', 'TWD', 'INR', 'THB', 'PHP', 'ZAR', 'SEK', 'NOK', 'DKK', 'CZK', 'ILS']);

function detectCurrency(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en-US';
    const localeParts = locale.split(/[-_]/);
    const lang = localeParts[0] ?? '';
    // Handles locales with a script subtag such as zh-Hant-TW.
    const region = localeParts.slice(1).find(part => /^[A-Za-z]{2}$/.test(part)) ?? '';
    const l = lang.toLowerCase();
    const r = region.toUpperCase();

    // Currency follows the user's device region, independently of the app or
    // device display language. Language is only a fallback for locales that do
    // not provide a region code.
    const regionCurrencies: Record<string, string> = {
      JP: 'JPY', US: 'USD', GB: 'GBP', KR: 'KRW', CN: 'CNY', TW: 'TWD', HK: 'HKD',
      AU: 'AUD', CA: 'CAD', BR: 'BRL', MX: 'MXN', SG: 'SGD', VN: 'VND', TH: 'THB',
      ID: 'IDR', PH: 'PHP', MY: 'MYR', SA: 'SAR', AE: 'AED', TR: 'TRY', ZA: 'ZAR',
      SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
      IL: 'ILS', NZ: 'NZD', IN: 'INR',
    };
    const euroRegions = new Set([
      'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
      'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
    ]);
    if (regionCurrencies[r]) return regionCurrencies[r];
    if (euroRegions.has(r)) return 'EUR';

    if (l === 'ja') return 'JPY';
    if (l === 'ko') return 'KRW';
    if (l === 'zh') {
      if (r === 'TW') return 'TWD';
      if (r === 'HK') return 'HKD';
      return 'CNY';
    }
    if (l === 'pt') return r === 'PT' ? 'EUR' : 'BRL';
    if (l === 'es') return (r === 'ES' || r === '') ? 'EUR' : 'USD';
    if (['de', 'fr', 'it', 'nl'].includes(l)) return 'EUR';
    if (l === 'tr') return 'TRY';
    if (l === 'id') return 'IDR';
    if (l === 'th') return 'THB';
    if (l === 'vi') return 'VND';
    if (l === 'pl') return 'PLN';
    if (l === 'sv') return 'SEK';
    if (l === 'nb' || l === 'no' || l === 'nn') return 'NOK';
    if (l === 'da') return 'DKK';
    if (l === 'he' || l === 'iw') return 'ILS';
    if (l === 'ar') return r === 'AE' ? 'AED' : 'SAR';
    if (l === 'hi') return 'INR';
    if (l === 'el') return 'EUR';
    if (l === 'en') {
      if (r === 'GB') return 'GBP';
      if (r === 'AU') return 'AUD';
      if (r === 'CA') return 'CAD';
      if (r === 'NZ') return 'NZD';
      if (r === 'SG') return 'SGD';
      if (r === 'HK') return 'HKD';
      if (r === 'IN') return 'INR';
      if (r === 'ZA') return 'ZAR';
      return 'USD';
    }
    return 'USD';
  } catch {
    return 'USD';
  }
}

// Cached once per app launch — locale doesn't change at runtime.
const DEVICE_CURRENCY = detectCurrency();

function commas(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a price tier (expressed as its JPY amount) into the user's local
 * currency string, e.g. formatPrice(320) → "$2.99" in the US, "¥320" in Japan.
 * Falls back to USD if the tier or currency is unknown.
 */
export function formatPrice(baseJpy: number): string {
  const tier = TIERS[baseJpy];
  if (!tier) return `¥${baseJpy}`;

  const currency = DEVICE_CURRENCY;
  const amount   = tier[currency] ?? tier.USD ?? baseJpy;
  const symbol   = SYMBOLS[currency] ?? '$';

  if (ZERO_DECIMAL.has(currency)) {
    return `${symbol}${commas(Math.round(amount))}`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}
