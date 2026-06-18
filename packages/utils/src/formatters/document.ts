export function formatCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  // Número BR com código de país: 12 dígitos (fixo) ou 13 (celular), começando
  // com 55. Números locais têm no máximo 11 dígitos (DDD + 9), então 12-13
  // dígitos iniciados em 55 só podem incluir o código de país.
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4)
    const rest = digits.slice(4)
    const head = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4)
    const tail = rest.length === 9 ? rest.slice(5) : rest.slice(4)
    return `+55 (${ddd}) ${head}-${tail}`
  }
  const d = digits.slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export function formatCEP(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}
