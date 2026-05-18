import { writeFileSync } from 'node:fs'
import { execa } from 'execa'

export interface PullOptions {
  service: string
  envName: string
  output: string
  dryRun?: boolean
  verbose?: boolean
}

export async function pull(options: PullOptions): Promise<void> {
  const { service, envName, output, dryRun = false, verbose = false } = options

  const { stdout } = await execa('chamber', ['env', `${service}/${envName}`])

  if (verbose) console.log(`Retrieved variables from ${service}/${envName}`)

  if (dryRun) {
    console.log(`[dry-run] Would write to ${output}:\n${stdout}`)
    return
  }

  writeFileSync(output, stdout, 'utf-8')
  const count = stdout.split('\n').filter(Boolean).length
  console.log(`✓ Pulled ${count} variables to ${output}`)
}
