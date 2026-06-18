const CURRENCY_LOCALES: Record<string, string> = {
  BRL: 'pt-BR',
  USD: 'en-US',
  GBP: 'en-GB',
}

export type FormatCurrencyOptions = {
  /** Casas decimais mínimas. Default 2. Use 0 para esconder centavos. */
  minimumFractionDigits?: number
  /** Casas decimais máximas. Default 2. */
  maximumFractionDigits?: number
}

export function formatCurrency(
  value: number,
  currency = 'BRL',
  options: FormatCurrencyOptions = {}
): string {
  const locale = CURRENCY_LOCALES[currency] ?? 'pt-BR'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  })
    .format(value)
    .replace(/ /g, ' ')
}
