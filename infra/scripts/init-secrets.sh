#!/usr/bin/env bash
# Crea los secretos de producción en SSM Parameter Store (SecureString). Idempotente: nunca sobrescribe.
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"

put() { # nombre valor
  if aws ssm get-parameter --region "$REGION" --name "$1" >/dev/null 2>&1; then
    echo "$1 ya existe (no se toca)"
    return
  fi
  aws ssm put-parameter --region "$REGION" --name "$1" --type SecureString --value "$2" >/dev/null
  echo "$1 creado"
}

put /gymtracker/prod/app-key "base64:$(openssl rand -base64 32)"
# Hex: Aurora no acepta / @ " ni espacios en la contraseña.
put /gymtracker/prod/db-password "$(openssl rand -hex 24)"
put /gymtracker/prod/push-signing-key "$(openssl rand -hex 32)"

# Par VAPID: las dos mitades deben calzar, así que se crean juntas y solo si falta la privada.
if aws ssm get-parameter --region "$REGION" --name /gymtracker/prod/vapid-private-key >/dev/null 2>&1; then
  echo "/gymtracker/prod/vapid-private-key ya existe (no se toca)"
else
  keys="$("$(dirname "$0")/../node_modules/.bin/web-push" generate-vapid-keys --json)"
  aws ssm put-parameter --region "$REGION" --name /gymtracker/prod/vapid-public-key --type SecureString --overwrite \
    --value "$(node -pe 'JSON.parse(process.argv[1]).publicKey' "$keys")" >/dev/null
  aws ssm put-parameter --region "$REGION" --name /gymtracker/prod/vapid-private-key --type SecureString \
    --value "$(node -pe 'JSON.parse(process.argv[1]).privateKey' "$keys")" >/dev/null
  echo "/gymtracker/prod/vapid-public-key y vapid-private-key creados"
fi
