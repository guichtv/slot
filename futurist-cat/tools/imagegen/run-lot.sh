#!/usr/bin/env bash
# Runs one ImageGen mission through Codex CLI (Git Bash on Windows). Usage:
#   bash tools/imagegen/run-lot.sh <mission> [--force]
# The brief (UTF-8) is passed by redirection (never "Get-Content | codex" under PowerShell 5.1: it
# destroys the accents). Only missing images are requested again unless --force.
set -u
LOT="${1:?mission manquante (voir docs/imagegen/PLAN.md)}"
FORCE="${2:-}"
cd "$(dirname "$0")/../.."
BRIEF="docs/imagegen/${LOT}.txt"
[ -f "$BRIEF" ] || { echo "brief introuvable : $BRIEF (node tools/imagegen/make-briefs.mjs)"; exit 2; }

CODEX="${CODEX:-/c/Users/maxim/AppData/Local/OpenAI/Codex/bin/faa963e871dd422c/codex.exe}"
if [ ! -x "$CODEX" ]; then
  CODEX="$(ls /c/Users/*/AppData/Local/OpenAI/Codex/bin/*/codex.exe 2>/dev/null | head -1)"
fi
if [ -z "$CODEX" ] || [ ! -x "$CODEX" ]; then
  CODEX="$(powershell.exe -NoProfile -Command '(Get-AppxPackage OpenAI.Codex).InstallLocation' 2>/dev/null | tr -d '\r')"
  [ -n "$CODEX" ] && CODEX="$(cygpath -u "$CODEX")/app/resources/codex.exe"
fi
[ -x "$CODEX" ] || { echo "codex.exe introuvable : definis CODEX=/chemin/vers/codex.exe"; exit 2; }
"$CODEX" login status >/dev/null 2>&1 || { echo "codex n'est pas connecte : lance \"$CODEX\" login"; exit 2; }
[ -d "$HOME/.codex/skills/.system/imagegen" ] || echo "ATTENTION : skill \$imagegen absent de ~/.codex/skills/.system/imagegen"

# images attendues pour cette mission
EXPECTED=$(node -e "const p=require('./assets/plan.json');for(const[k,v]of Object.entries(p.images))if(v.lot==='$LOT')console.log(k)")
MISSING=""
for id in $EXPECTED; do [ -f "assets/generated/$LOT/$id.png" ] || MISSING="$MISSING $id"; done
if [ -z "$MISSING" ] && [ "$FORCE" != "--force" ]; then echo "[$LOT] complet, rien a faire"; exit 0; fi
echo "[$LOT] images a produire :${MISSING:- (toutes, --force)}"

mkdir -p "docs/imagegen/logs" "assets/generated/$LOT"
BRIEF_RUN="$BRIEF"
if [ -n "$MISSING" ] && [ "$FORCE" != "--force" ] && [ "$(echo $EXPECTED | wc -w)" != "$(echo $MISSING | wc -w)" ]; then
  BRIEF_RUN="docs/imagegen/logs/${LOT}.retry.txt"
  { cat "$BRIEF"; echo; echo "RELANCE : ne produire QUE les images suivantes (les autres existent deja et sont validees) :$MISSING"; } > "$BRIEF_RUN"
fi
"$CODEX" exec -m gpt-6-astra --sandbox workspace-write --skip-git-repo-check -C "$(cygpath -w "$PWD")" \
  -o "docs/imagegen/logs/${LOT}.last.md" - < "$BRIEF_RUN" > "docs/imagegen/logs/${LOT}.log" 2>&1
CODE=$?
if grep -q "Ã©\|Ã¨\|Ã " "docs/imagegen/logs/${LOT}.log"; then echo "ATTENTION : accents abimes dans le log ($LOT) : le brief n'a pas ete lu en UTF-8"; fi
if grep -qi "401\|codex-code-mode-host.exe" "docs/imagegen/logs/${LOT}.log"; then echo "[$LOT] erreur 401 / hote introuvable : attendre puis relancer (seules les images absentes le seront)"; fi
DONE=0; for id in $EXPECTED; do [ -f "assets/generated/$LOT/$id.png" ] && DONE=$((DONE+1)); done
echo "[$LOT] termine (code $CODE) : $DONE / $(echo $EXPECTED | wc -w) images presentes. Rapport : docs/imagegen/logs/${LOT}.last.md"
