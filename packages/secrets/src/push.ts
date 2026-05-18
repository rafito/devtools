import { readFileSync } from 'node:fs'
import { execa } from 'execa'

export interface PushOptions {
  envFile: string
  service: string
  envName: string
  dryRun?: boolean
  verbose?: boolean
}

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const raw = trimmed.slice(idx + 1).trim()
    result[key] = raw.replace(/^["']|["']$/g, '')
  }
  return result
}

export async function push(options: PushOptions): Promise<void> {
  const { envFile, service, envName, dryRun = false, verbose = false } = options
  const content = readFileSync(envFile, 'utf-8')
  const entries = Object.entries(parseEnvContent(content))

  if (verbose) console.log(`Found ${entries.length} variables in ${envFile}`)

  for (const [key, value] of entries) {
    if (verbose) console.log(`  ${dryRun ? '[dry-run] ' : ''}${key}`)
    if (!dryRun) {
      await execa('chamber', ['write', `${service}/${envName}`, key, value])
    }
  }

  console.log(`✓ ${dryRun ? '[dry-run] ' : ''}Pushed ${entries.length} variables to ${service}/${envName}`)
}
