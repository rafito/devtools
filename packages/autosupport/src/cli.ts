#!/usr/bin/env node

import { toErrorMessage } from './errors.js'
import { loadServiceConfig } from './service/config.js'
import { startAutosupportService } from './service/index.js'
import { VERSION } from './version.js'

const HELP = `@devorama/autosupport ${VERSION}

Uso:
  autosupport serve     inicia o serviço HTTP para qualquer backend
  autosupport --help    mostra esta ajuda
  autosupport --version mostra a versão

Configure o serviço por variáveis de ambiente.
Documentação: https://github.com/rafito/devtools/tree/main/packages/autosupport#standalone-service
`

type ServiceEnvironment = Record<string, string | undefined>

type CliDependencies = {
  stdout?: (message: string) => void
  stderr?: (message: string) => void
  startService?: typeof startAutosupportService
  registerSignals?: boolean
}

export async function runCli(
  args: string[] = process.argv.slice(2),
  env: ServiceEnvironment = process.env,
  dependencies: CliDependencies = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log
  const stderr = dependencies.stderr ?? console.error
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    stdout(HELP)
    return 0
  }
  if (command === '--version' || command === '-v') {
    stdout(VERSION)
    return 0
  }
  if (command !== 'serve') {
    stderr(`Comando desconhecido: ${command}\n\n${HELP}`)
    return 1
  }

  try {
    const config = loadServiceConfig(env)
    const service = await (dependencies.startService ?? startAutosupportService)(config)
    stdout(`[autosupport-service] pronto em ${service.url}`)
    stdout(`[autosupport-service] analisando o repositório ${config.rootDir}`)

    if (dependencies.registerSignals !== false) {
      let closing = false
      const shutdown = async (signal: string) => {
        if (closing) return
        closing = true
        stdout(`[autosupport-service] encerrando após ${signal}`)
        try {
          await service.close()
        } catch (error) {
          stderr(`[autosupport-service] falha ao encerrar: ${toErrorMessage(error)}`)
          process.exitCode = 1
        }
      }
      process.once('SIGINT', () => void shutdown('SIGINT'))
      process.once('SIGTERM', () => void shutdown('SIGTERM'))
    }
    return 0
  } catch (error) {
    stderr(`[autosupport-service] ${toErrorMessage(error)}`)
    return 1
  }
}

const entryPath = process.argv[1]
if (entryPath && /(?:^|[\\/])(?:cli\.(?:[cm]?[jt]s)|autosupport)$/.test(entryPath)) {
  void runCli().then((code) => {
    if (code !== 0) process.exitCode = code
  })
}
