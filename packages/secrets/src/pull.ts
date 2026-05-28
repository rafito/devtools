import { existsSync, writeFileSync } from 'node:fs'
import { execa } from 'execa'

export interface PullOptions {
  service: string
  envName: string
  output: string
  force?: boolean
  dryRun?: boolean
  verbose?: boolean
}

export async function pull(options: PullOptions): Promise<void> {
  const { service, envName, output, force = false, dryRun = false, verbose = false } = options

  const { stdout } = await execa('chamber', ['env', `${service}/${envName}`])

  if (verbose) console.log(`Retrieved variables from ${service}/${envName}`)

  if (dryRun) {
    const keys = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')[0])
    console.log(`[dry-run] Would write ${keys.length} variables to ${output}: ${keys.join(', ')}`)
    return
  }

  if (existsSync(output) && !force) {
    throw new Error(`Refusing to overwrite existing ${output}. Pass --force to override.`)
  }

  writeFileSync(output, stdout, 'utf-8')
  const count = stdout.split('\n').filter(Boolean).length
  console.log(`✓ Pulled ${count} variables to ${output}`)
}
