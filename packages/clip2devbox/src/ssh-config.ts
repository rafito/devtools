function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True se ja existe um bloco `Host <alias>` no config. */
export function hasSshHost(config: string, alias: string): boolean {
  return new RegExp(`^[ \\t]*Host[ \\t]+${escapeRegExp(alias)}[ \\t]*$`, 'im').test(config)
}

/** Renderiza um bloco `Host <alias>` com os campos dados. */
export function renderHostBlock(alias: string, fields: Record<string, string>): string {
  const lines = [`Host ${alias}`, ...Object.entries(fields).map(([k, v]) => `    ${k} ${v}`)]
  return lines.join('\n')
}

/**
 * Adiciona o bloco do host se ainda nao existir. Idempotente: se o alias ja
 * estiver presente, devolve o config inalterado (nao mexe em config feito a mao).
 */
export function upsertSshHost(
  config: string,
  alias: string,
  fields: Record<string, string>
): string {
  if (hasSshHost(config, alias)) return config
  const block = renderHostBlock(alias, fields)
  if (config.trim().length === 0) return `${block}\n`
  const sep = config.endsWith('\n') ? '\n' : '\n\n'
  return `${config}${sep}${block}\n`
}
