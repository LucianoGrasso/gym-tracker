#!/usr/bin/env bash
# Ejecuta un comando artisan en la Lambda de consola. Uso: infra/scripts/artisan.sh "migrate --force"
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"
[[ $# -eq 1 ]] || { echo 'uso: artisan.sh "<comando>"' >&2; exit 2; }

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
PAYLOAD="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1")"

ERROR="$(aws lambda invoke --region "$REGION" --function-name gymtracker-artisan \
  --cli-binary-format raw-in-base64-out --payload "$PAYLOAD" \
  --query FunctionError --output text "$OUT")"

python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
print(d.get("output", d) if isinstance(d, dict) else d)' "$OUT"
[[ "$ERROR" == "None" ]] || { echo "artisan falló ($ERROR)" >&2; exit 1; }
