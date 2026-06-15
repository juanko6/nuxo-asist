#!/usr/bin/env bash
# Restaura un dump de la base de datos de producción.
#
# Uso:
#   ./scripts/restore.sh <ruta/al/backup.sql.gz>
#
# Requiere el contenedor de la BD levantado (docker compose up -d db) y el .env
# en la raíz. Los dumps los genera el servicio `backup` en el volumen
# asist_backups; cópialos al host con:
#   docker compose cp backup:/backups/daily/<fichero>.sql.gz ./
set -euo pipefail

FILE="${1:?Uso: ./scripts/restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No existe el fichero: $FILE" >&2; exit 1; }

# Carga POSTGRES_USER / POSTGRES_DB del .env
set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "Restaurando '$FILE' en la base de datos '${POSTGRES_DB}'…"
gunzip -c "$FILE" | docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
echo "Restauración completada."
