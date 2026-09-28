#!/usr/bin/env bash
# ImageGen queue via Codex CLI (Annexe A).
# Usage : tools/codex-queue.sh <parallel 1-3> docs/imagegen/<lot>.txt [...]
# - concatène _header.txt + _style.txt + <lot>.txt (UTF-8, jamais via un pipe PowerShell)
# - lance au plus <parallel> missions, départs espacés de STAGGER secondes (30-45 s)
# - sur 401 / token_revoked / Missing bearer / codex-code-mode-host : attend puis relance
#   (le brief demande de ne régénérer que les fichiers absents)
# Variables : CODEX (binaire), CODEX_MODEL (gpt-6-astra), STAGGER (40), RETRIES (3),
#             STYLE_FILE (docs/imagegen/_style.txt ; _style-house.txt pour les directions)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

PAR="${1:-2}"; shift || true
if [ "$PAR" -gt 3 ]; then PAR=3; fi
MODEL="${CODEX_MODEL:-gpt-6-astra}"
STAGGER="${STAGGER:-40}"
RETRIES="${RETRIES:-3}"
STYLE_FILE="${STYLE_FILE:-docs/imagegen/_style.txt}"

if [ -z "${CODEX:-}" ]; then
  if command -v codex >/dev/null 2>&1; then CODEX="$(command -v codex)"
  elif [ -x "/c/Users/maxim/AppData/Local/OpenAI/Codex/bin/faa963e871dd422c/codex.exe" ]; then
    CODEX="/c/Users/maxim/AppData/Local/OpenAI/Codex/bin/faa963e871dd422c/codex.exe"
  else
    CODEX="$(ls -1 /c/Users/*/AppData/Local/OpenAI/Codex/bin/*/codex.exe 2>/dev/null | head -1)"
  fi
fi
if [ -z "$CODEX" ]; then echo "codex introuvable (définir CODEX=...)" >&2; exit 2; fi

winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

mkdir -p docs/imagegen/logs

run_one() {
  local brief="$1" lot attempt=0 full log last
  lot="$(basename "$brief" .txt)"
  full="docs/imagegen/logs/$lot.full.txt"
  log="docs/imagegen/logs/$lot.log"
  last="docs/imagegen/logs/$lot.last.md"
  cat docs/imagegen/_header.txt "$STYLE_FILE" "$brief" > "$full"
  while :; do
    attempt=$((attempt + 1))
    echo "[$(date +%H:%M:%S)] start $lot (essai $attempt)"
    "$CODEX" exec -m "$MODEL" --sandbox workspace-write --skip-git-repo-check \
      -C "$(winpath "$ROOT")" -o "$last" - < "$full" > "$log.$attempt" 2>&1
    local code=$?
    cp "$log.$attempt" "$log"
    if grep -qiE "401 Unauthorized|token_revoked|Missing bearer|codex-code-mode-host" "$log.$attempt"; then
      if [ "$attempt" -le "$RETRIES" ]; then
        echo "[$(date +%H:%M:%S)] $lot : erreur d'authentification/hôte, nouvelle tentative dans $((attempt * 60)) s"
        sleep $((attempt * 60)); continue
      fi
    fi
    if grep -qiE "usage limit|rate limit|quota" "$log.$attempt"; then
      echo "[$(date +%H:%M:%S)] $lot : QUOTA atteint — arrêt de la génération" | tee -a docs/imagegen/logs/QUOTA.txt
    fi
    echo "[$(date +%H:%M:%S)] fin $lot (code $code)"
    return 0
  done
}

first=1
for brief in "$@"; do
  if [ -f docs/imagegen/logs/QUOTA.txt ]; then echo "quota atteint, $brief non lancé"; continue; fi
  while [ "$(jobs -rp | wc -l)" -ge "$PAR" ]; do wait -n; done
  if [ $first -eq 0 ]; then sleep "$STAGGER"; fi
  first=0
  run_one "$brief" &
done
wait
echo "file terminée"
