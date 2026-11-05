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
