---
description: Carrega a(s) imagem(ns) mais recente(s) de @@CLIPS@@ no contexto
argument-hint: "[quantas] (padrao 1)"
allowed-tools: Bash(ls:*)
---
Imagens mais recentes em @@CLIPS@@ (mais nova primeiro):

!`n="$ARGUMENTS"; ls -t @@CLIPS@@/* 2>/dev/null | head -n "${n:-1}"`

Use a ferramenta Read em cada caminho listado acima para carregar a(s) imagem(ns) no contexto. Se a lista estiver vazia, me avise que nao ha imagens em @@CLIPS@@ e nao faca mais nada.
