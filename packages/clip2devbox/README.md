# @devorama/clip2devbox

Manda **arquivo ou print do clipboard** (Windows) pra uma **devbox** via Tailscale + `scp` e troca o clipboard pelo **caminho remoto com prefixo `@`** — pronto pra colar no Claude Code / ttyd.

Fluxo: copia (`Ctrl+C` num arquivo / `Win+Shift+S` print / "copiar link") → `Ctrl+Alt+V` → no Claude da devbox `/clip` (ou cola `Ctrl+V` o `@/home/voce/clips/...` e Enter).

Cobre 3 origens, nesta prioridade:

1. **bitmap** no clipboard (print, "copiar imagem" do browser, Paint/PS) → vira `.png`
2. **arquivo(s)** copiado(s) no Explorer — **qualquer tipo** (PDF, .csv, código, .zip…), sobe direto preservando o nome, suporta vários
3. **URL** ("copiar link/endereço") — baixa e sobe qualquer arquivo (nome via `Content-Disposition`/URL)

Arquivos acima de `--max-file-mb` (default 100 MB) são pulados com aviso.

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
  --retention-hours 24 \            # apaga clips mais velhos que isso
  --max-file-mb 100 \               # tamanho maximo por arquivo (0 = sem limite)
  --progress-min-mb 5 \             # mostra barra de progresso acima disso (0 = nunca)
  --no-auto-update                  # desliga o auto-update em background
```

## Uso

| Comando | O que faz |
|---------|-----------|
| `clip2devbox install` | configura tudo (idempotente) |
| `clip2devbox run` | executa a ação agora (mesma coisa da hotkey) — útil pra testar |
| `clip2devbox uninstall` | remove hotkey e script local |
| `clip2devbox uninstall --remote` | acima + remove `/clip` e cron na devbox |

Na devbox, depois de qualquer envio:

- `/clip` → carrega o arquivo mais recente de `~/clips` no contexto (imagem, PDF, texto…)
- `/clip 3` → carrega os 3 mais recentes

## Feedback

- **beep agudo** + balão → enviado
- **beep grave** + balão → erro (clipboard vazio, URL inválida, arquivo acima do limite, devbox fora do ar…)
- arquivo grande (acima de `--progress-min-mb`, default 5 MB) → **barra de progresso** durante o envio

## Auto-update

Por padrão, depois de um envio bem-sucedido o script checa **1x/dia** (em background, sem
atrasar nada) se há versão nova no npm e, se houver, roda `pnpm add -g` (ou `npm i -g`) +
`clip2devbox install` sozinho. Desligue com `--no-auto-update` no install. O auto-update só
passa a valer **depois que você atualizar uma vez** pra versão que o traz (≥ 0.3.0).

## Como funciona

`install` renderiza um script PowerShell em `%LOCALAPPDATA%\clip2devbox\clip2devbox.ps1`
com o host, o diretório, os limites de tamanho e a versão embutidos, e cria um atalho `.lnk`
no Start Menu com a hotkey global apontando pra ele. A auth herda do **Tailscale SSH**, então
o `scp` não pede senha. A limpeza é uma linha de `crontab` na devbox (marcada com
`# clip2devbox-cleanup`).
