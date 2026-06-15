# @devorama/clip2devbox

Manda o **print do clipboard** (Windows) pra uma **devbox** via Tailscale + `scp` e troca o clipboard pelo **caminho remoto com prefixo `@`** — pronto pra colar no Claude Code / ttyd.

Fluxo: `Win+Shift+S` → `Ctrl+Alt+V` → no Claude da devbox `/clip` (ou cola `Ctrl+V` o `@/home/voce/clips/...` e Enter).

Cobre 3 origens de imagem, nesta prioridade:

1. **bitmap** no clipboard (print, "copiar imagem" do browser, Paint/PS)
2. **arquivo(s)** de imagem copiado(s) no Explorer (sobe direto, suporta vários)
3. **URL** de imagem ("copiar endereço da imagem") — baixa e sobe

## Pré-requisitos

- **Windows** (clipboard + hotkey nativos)
- **Tailscale** ativo, com a devbox acessível e **Tailscale SSH** habilitado (auth sem senha)
- `ssh`/`scp` no PATH (OpenSSH, já vem no Windows 10/11)
- Na devbox: Linux com `crontab` (pra limpeza) e Claude Code (pro `/clip`)

## Instalação

```bash
pnpm add -g @devorama/clip2devbox   # ou: npm i -g @devorama/clip2devbox
clip2devbox install
```

O `install` detecta o host da devbox via Tailscale (peer `devbox`), escreve o
`~/.ssh/config`, valida a conexão, provisiona o lado remoto (`~/clips`, o slash
command `/clip`, e a limpeza por cron) e cria a hotkey.

### Opções

```bash
clip2devbox install \
  --host devbox.tailXXXX.ts.net \   # default: detecta via Tailscale
  --peer devbox \                   # nome do peer Tailscale a procurar
  --alias devbox \                  # alias do Host no ~/.ssh/config
  --remote-user rafito \            # default: usuario local do Windows
  --remote-dir /home/rafito/clips \ # default: /home/<user>/clips
  --hotkey CTRL+ALT+V \             # combinacao da hotkey
  --retention-hours 24              # apaga clips mais velhos que isso
```

## Uso

| Comando | O que faz |
|---------|-----------|
| `clip2devbox install` | configura tudo (idempotente) |
| `clip2devbox run` | executa a ação agora (mesma coisa da hotkey) — útil pra testar |
| `clip2devbox uninstall` | remove hotkey e script local |
| `clip2devbox uninstall --remote` | acima + remove `/clip` e cron na devbox |

Na devbox, depois de qualquer envio:

- `/clip` → carrega a imagem mais recente de `~/clips` no contexto
- `/clip 3` → carrega as 3 mais recentes

## Feedback

- **beep agudo** + balão → enviado
- **beep grave** + balão → erro (sem imagem, URL inválida, devbox fora do ar…)

## Como funciona

`install` renderiza um script PowerShell em `%LOCALAPPDATA%\clip2devbox\clip2devbox.ps1`
com o host e o diretório embutidos, e cria um atalho `.lnk` no Start Menu com a
hotkey global apontando pra ele. A auth herda do **Tailscale SSH**, então o `scp`
não pede senha. A limpeza é uma linha de `crontab` na devbox (marcada com
`# clip2devbox-cleanup`).
