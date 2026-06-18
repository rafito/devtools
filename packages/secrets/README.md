# @devorama/secrets

[![npm version](https://img.shields.io/npm/v/@devorama/secrets.svg)](https://www.npmjs.com/package/@devorama/secrets)
[![npm downloads](https://img.shields.io/npm/dm/@devorama/secrets.svg)](https://www.npmjs.com/package/@devorama/secrets)
[![license](https://img.shields.io/npm/l/@devorama/secrets.svg)](https://github.com/rafito/devtools/blob/main/LICENSE)

A tiny CLI to sync `.env` files with **AWS Parameter Store** via [`chamber`](https://github.com/segmentio/chamber). Push a local `.env` up to `<service>/<env>`, or pull it back down — perfect for sharing secrets across a team or wiring them into CI.

## Install

```bash
npm install -D @devorama/secrets
# or install globally: npm install -g @devorama/secrets
```

### Requirements

- [`chamber`](https://github.com/segmentio/chamber#installation) available on your `PATH`
- AWS credentials (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`, or `~/.aws/credentials`)

## Usage

### Push `.env` → Parameter Store

```bash
devtools secrets push \
  --env .env.production \
  --service my-app \
  --env-name production
```

| Flag | Description |
|------|-------------|
| `--env <file>` | Source `.env` file (default `.env`) |
| `--service <name>` | **Required.** Chamber service name |
| `--env-name <name>` | **Required.** Environment (e.g. `staging`, `production`) |
| `--kms-alias <alias>` | KMS key alias used for encryption — see [KMS key alias](#kms-key-alias) |
| `--dry-run` | Print what would be written without touching AWS |
| `--verbose` | Log every key |

### Pull Parameter Store → `.env`

```bash
devtools secrets pull \
  --service my-app \
  --env-name production \
  --output .env.production
```

| Flag | Description |
|------|-------------|
| `--service <name>` | **Required.** Chamber service name |
| `--env-name <name>` | **Required.** Environment |
| `--output <file>` | Output path (default `.env`) |
| `--force` | Overwrite an existing file |
| `--dry-run` | List keys only (never values) |
| `--verbose` | Log details |

`pull` uses `chamber export --format dotenv`, so the generated file is plain `KEY=value` (no `export ` prefix) — compatible with `docker compose --env-file`, `direnv`, GitHub Actions, and standard `.env` parsers.

## KMS key alias

By default `chamber write` encrypts with `alias/parameter_store_key` (a customer-managed KMS key), which **does not exist automatically in every AWS region**. In `sa-east-1`, for example, a push fails with:

```
InvalidKeyId: Alias arn:aws:kms:sa-east-1:<acct>:alias/parameter_store_key is not found.
```

Pick one of:

1. **CLI flag** (best for a one-off push):

   ```bash
   devtools secrets push --kms-alias alias/aws/ssm --service my-app --env-name production
   ```

2. **Env var** (best for scripts/CI):

   ```bash
   CHAMBER_KMS_KEY_ALIAS=alias/aws/ssm devtools secrets push ...
   ```

3. **Create the customer-managed key** in the region — see the [chamber docs](https://github.com/segmentio/chamber#quick-start). A customer-managed key gives you finer IAM/audit control than `alias/aws/ssm`.

## License

[MIT](./LICENSE) © Rafael D'Arrigo
