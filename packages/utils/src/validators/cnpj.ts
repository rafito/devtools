export function isValidCNPJ(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false

  const calcDigit = (cnpj: string, weights: number[]): number => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(cnpj[i]) * weights[i]
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  return (
    calcDigit(digits, w1) === parseInt(digits[12]) &&
    calcDigit(digits, w2) === parseInt(digits[13])
  )
}
