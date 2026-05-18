#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { execaSync } from 'execa'
import { pull } from './pull'
import { push } from './push'

export function checkPreflight(): void {
  try {
    execaSync('chamber', ['version'])
  } catch {
    console.error('Error: `chamber` binary not found in PATH.')
    console.error('Install: https://github.com/segmentio/chamber#installation')
    process.exit(1)
  }

  const hasCredentials =
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    Boolean(process.env.AWS_PROFILE) ||
    existsSync(`${process.env.HOME}/.aws/credentials`)

  if (!hasCredentials) {
    console.error('Error: AWS credentials not configured.')
    console.error('Set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or configure ~/.aws/credentials')
    process.exit(1)
  }
}

const program = new Command()

program.name('devtools').description('Devorama developer tools CLI').version('0.1.0')

const secretsCmd = program.command('secrets').description('Manage secrets via AWS Parameter Store')

secretsCmd
  .command('push')
  .description('Push .env variables to AWS Parameter Store')
  .option('--env <file>', '.env file to push', '.env')
  .requiredOption('--service <name>', 'Chamber service name')
  .requiredOption('--env-name <name>', 'Environment name (e.g. staging, production)')
  .option('--dry-run', 'Show what would be pushed without writing', false)
  .option('--verbose', 'Log each key being processed', false)
  .action(async (opts) => {
    checkPreflight()
    await push({
      envFile: opts.env,
      service: opts.service,
      envName: opts.envName,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    })
  })

secretsCmd
  .command('pull')
  .description('Pull variables from AWS Parameter Store to a .env file')
  .requiredOption('--service <name>', 'Chamber service name')
  .requiredOption('--env-name <name>', 'Environment name (e.g. staging, production)')
  .option('--output <file>', 'Output .env file path', '.env')
  .option('--dry-run', 'Show what would be written without creating the file', false)
  .option('--verbose', 'Log details', false)
  .action(async (opts) => {
    checkPreflight()
    await pull({
      service: opts.service,
      envName: opts.envName,
      output: opts.output,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    })
  })

// Only parse argv when invoked directly (not when imported in tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse()
}
