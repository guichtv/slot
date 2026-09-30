#!/usr/bin/env bash
# All proof videos (section 8) from the SERVED QA build, on the virtual clock (frame-exact).
#   bash tools/record-proofs.sh [dist-qa] [name ...]      (names: testanim-desktop testanim-mobile
#   bonus-9vies bonus-double-regard achat maxwin cas-limites)
# Heavy: at most two chains at once, each with its own PORT (e.g. PORT=5347 bash tools/record-proofs.sh dist-qa testanim-mobile). Without the real cat (public/assets/cat/cat.glb) the synthetic test rig is shown.
set -euo pipefail
cd "$(dirname "$0")/.."
DIST="${1:-dist-qa}"; shift || true
OUT=docs/preuves/videos
mkdir -p "$OUT"
CAT=""
[ -f public/assets/cat/cat.glb ] || CAT="&catglb=./dev/test-rig.glb"
ONLY=("$@")
run() { local name=$1; shift
  if [ ${#ONLY[@]} -gt 0 ] && [[ ! " ${ONLY[*]} " =~ " ${name} " ]]; then return 0; fi
  echo "== $name"; node tools/record.mjs --port "${PORT:-5348}" --dist "$DIST" --out "$OUT/$name.mp4" --url "$CAT&lang=fr" "$@" 2>&1 | grep -E '^\[record\]|^\{' || true
  node tools/video-sheet.mjs "$OUT/$name.mp4" --every 0.5 --width 240 --cols 8 --out "$OUT/$name-planche.jpg" >/dev/null || true
}
G='window.__qaGame'
run testanim-desktop --size 1440x900 --testanim --max 600
run testanim-mobile --size 390x844 --dpr 3 --vw 780 --fps 24 --testanim --max 600
run bonus-9vies --size 1280x720 --fps 24 --play F09 --max 300
run bonus-double-regard --size 1280x720 --fps 24 --play F11 --max 300
run achat --size 1280x720 --fps 24 --max 300 --script "eval:$G.d.provider.dev.forceNext='F22';frames:15;tap:.btn.buy;frames:20;tap:.card-super;frames:20;tap:.confirm .btn.primary;auto:1;idle"
run maxwin --size 1280x720 --fps 24 --play F20 --max 300
run cas-limites --size 1280x720 --fps 24 --max 120 --script "eval:(window.__qaSetBalance(1234567890.12), $G.betIndex=0, $G.refreshHud(), true);frames:20;eval:$G.d.provider.dev.forceNext='F24';tap:.btn.spin;idle;eval:($G.betIndex=$G.session.betLevels.length-1, $G.refreshHud(), true);frames:15;eval:$G.d.provider.dev.forceNext='F07';tap:.btn.spin;frames:10;tap:.btn.spin;idle;auto:1;eval:window.__qaSettings({turbo:true});eval:$G.d.provider.dev.forceNext='F08';tap:.btn.spin;idle;eval:window.__qaSettings({turbo:false, reduced:true});eval:$G.d.provider.dev.forceNext='F16';tap:.btn.spin;idle;eval:window.__qaSettings({reduced:false});eval:$G.d.provider.dev.failNext='ERR_IPB';tap:.btn.spin;frames:45;tap:.dialog.error .btn;frames:20;eval:window.__qaLoseContext(2.5);frames:120"
ls -la "$OUT"
