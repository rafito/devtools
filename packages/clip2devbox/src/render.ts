/** Substitui tokens `@@NOME@@` num template. Lanca se faltar variavel. */
export function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/@@(\w+)@@/g, (_m, key: string) => {
    if (!(key in vars)) throw new Error(`Variavel de template ausente: ${key}`)
    return vars[key]
  })
}

/** Monta a linha de crontab que apaga clips mais velhos que `retentionHours`. */
export function buildCronLine(remoteDir: string, retentionHours: number): string {
  const mins = Math.round(retentionHours * 60)
  return `0 * * * * find ${remoteDir} -type f -mmin +${mins} -delete # clip2devbox-cleanup`
}
