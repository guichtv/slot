#!/usr/bin/env bash
# All missions after "ref", at most 2 at a time, starts spaced by 40 s (rule of 2 heavy tasks).
#   bash tools/imagegen/run-all.sh [mission ...]
cd "$(dirname "$0")/../.."
[ -f assets/generated/ref/ref.screen.png ] || { echo "Lance d'abord : bash tools/imagegen/run-lot.sh ref (et valide l'image)"; exit 2; }
if [ "$#" -gt 0 ]; then LOTS="$*"; else
  LOTS=$(node -e "const p=require('./assets/plan.json');console.log(Object.entries(p.lots).sort((a,b)=>a[1].order-b[1].order).map(x=>x[0]).filter(x=>x!=='ref').join(' '))")
fi
running=0
for lot in $LOTS; do
  while [ "$(jobs -rp | wc -l)" -ge 2 ]; do sleep 5; done
  echo "=== $lot ==="
  bash tools/imagegen/run-lot.sh "$lot" &
  sleep 40
done
wait
node tools/imagegen/quota.mjs || true
echo "Missions terminees. Etape suivante : npm run assets"
