export function isValidCPF(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false

  const calcDigit = (cpf: string, factor: number): number => {
    let sum = 0
    for (let i = 0; i < factor - 1; i++) {
      sum += Number.parseInt(cpf[i]) * (factor - i)
    }
    const remainder = (sum * 10) % 11
    return remainder >= 10 ? 0 : remainder
  }

  return (
    calcDigit(digits, 10) === Number.parseInt(digits[9]) &&
    calcDigit(digits, 11) === Number.parseInt(digits[10])
  )
}
