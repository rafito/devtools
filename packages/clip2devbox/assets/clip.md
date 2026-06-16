---
description: Carrega o(s) arquivo(s) mais recente(s) de @@CLIPS@@ no contexto
argument-hint: "[quantos] (padrao 1)"
allowed-tools: Bash(ls:*)
---
Arquivos mais recentes em @@CLIPS@@ (mais novo primeiro):

!`n="$ARGUMENTS"; ls -t @@CLIPS@@/* 2>/dev/null | head -n "${n:-1}"`

Use a ferramenta Read em cada caminho listado acima para carregar o(s) arquivo(s) no contexto (imagem, PDF, texto, etc.). Se a lista estiver vazia, me avise que nao ha arquivos em @@CLIPS@@ e nao faca mais nada.
