# @devorama/secrets

CLI para gerenciar secrets em AWS Parameter Store via [chamber](https://github.com/segmentio/chamber). Push/pull de arquivos `.env` para/de `<service>/<envName>`.

## Instalação

```bash
pnpm add -D @devorama/secrets
# ou global:
pnpm add -g @devorama/secrets
```

Pré-requisitos:

- [`chamber`](https://github.com/segmentio/chamber#installation) no PATH
- Credenciais AWS (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`, ou `~/.aws/credentials`)

## Uso

### Push `.env` → Parameter Store

```bash
devtools secrets push \
  --env .env.production \
  --service my-app \
  --env-name production
```

Opções:

- `--env <file>` — arquivo `.env` (default `.env`)
- `--service <name>` — nome do chamber service (obrigatório)
- `--env-name <name>` — environment (ex.: `staging`, `production`) (obrigatório)
- `--kms-alias <alias>` — KMS key alias para encryption (ver [KMS](#kms-key-alias))
- `--dry-run` — só lista o que seria escrito
- `--verbose` — log de cada chave

### Pull Parameter Store → `.env`

```bash
devtools secrets pull \
  --service my-app \
  --env-name production \
  --output .env.production
```

Opções:

- `--service <name>` — nome do chamber service (obrigatório)
- `--env-name <name>` — environment (obrigatório)
- `--output <file>` — caminho de saída (default `.env`)
- `--force` — sobrescreve arquivo existente
- `--dry-run` — só lista as keys (não os valores)
- `--verbose` — log de detalhes

O `pull` usa `chamber export --format dotenv`, então o arquivo gerado fica no formato `KEY=value` (sem prefixo `export `), compatível com `docker-compose --env-file`, `direnv`, GitHub Actions e parsers `.env` padrão.

## KMS Key Alias

Por padrão `chamber write` encripta com `alias/parameter_store_key` (customer-managed KMS key), que **não existe automaticamente em todas as regions AWS**. Em `sa-east-1`, por exemplo, o push falha com:

```
InvalidKeyId: Alias arn:aws:kms:sa-east-1:<acct>:alias/parameter_store_key is not found.
```

Soluções:

1. **Flag CLI** (recomendado para um push pontual):

   ```bash
   devtools secrets push --kms-alias alias/aws/ssm --service my-app --env-name production
   ```

2. **Env var** (recomendado para scripts/CI):

   ```bash
   CHAMBER_KMS_KEY_ALIAS=alias/aws/ssm devtools secrets push ...
   ```

3. **Criar a chave customer-managed** na region — ver [docs do chamber](https://github.com/segmentio/chamber#quick-start) (`chamber` aceita customer-managed keys e oferece melhor controle de IAM/audit que `alias/aws/ssm`).

## License

MIT
