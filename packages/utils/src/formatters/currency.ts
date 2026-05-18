const CURRENCY_LOCALES: Record<string, string> = {
  BRL: 'pt-BR',
  EUR: 'pt-BR',
  USD: 'en-US',
  GBP: 'en-GB',
}

export function formatCurrency(value: number, currency = 'BRL'): string {
  const locale = CURRENCY_LOCALES[currency] ?? 'pt-BR'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace(/ /g, ' ')
}
