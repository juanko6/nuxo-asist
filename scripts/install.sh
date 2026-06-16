#!/usr/bin/env bash
#
# nuxoasist — instalador / "doctor" para VPS (Ubuntu/Debian).
#
# Comprueba los requisitos (y los instala si faltan), descarga el repo, prepara
# el .env y despliega la app con Docker. Pensado para que el encargado de la
# instalación lo lance en una VPS recién creada.
#
# Uso:
#   sudo bash install.sh            # diagnostica, instala lo necesario y despliega
#   sudo bash install.sh --check    # solo diagnóstico (no instala ni despliega)
#
# Variables opcionales:
#   NUXOASIST_DIR=/opt/nuxoasist    # carpeta de instalación
#   NUXOASIST_REF=develop           # rama/etiqueta del repo a desplegar
#
set -euo pipefail

REPO_URL="https://github.com/juanko6/asist_employed.git"
REPO_REF="${NUXOASIST_REF:-main}"
TARGET_DIR="${NUXOASIST_DIR:-/opt/nuxoasist}"
CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

# --- salida con color ---
if [ -t 1 ]; then
  C_OK=$'\e[32m'; C_WARN=$'\e[33m'; C_ERR=$'\e[31m'; C_INFO=$'\e[36m'; C_OFF=$'\e[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_INFO=""; C_OFF=""
fi
log()  { echo "${C_INFO}›${C_OFF} $*"; }
ok()   { echo "${C_OK}✓${C_OFF} $*"; }
warn() { echo "${C_WARN}!${C_OFF} $*"; }
err()  { echo "${C_ERR}✗${C_OFF} $*" >&2; }
ask()  { local p="$1" d="${2:-}" r; read -r -p "$p" r </dev/tty || true; echo "${r:-$d}"; }

MISSING=0

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    err "Ejecuta el script como root o con sudo:  sudo bash install.sh"
    exit 1
  fi
}

detect_os() {
  if [ ! -r /etc/os-release ]; then
    err "No se reconoce el sistema operativo (falta /etc/os-release)."
    exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}${ID_LIKE:-}" in
    *debian*|*ubuntu*) ok "Sistema compatible: ${PRETTY_NAME:-$ID}" ;;
    *) warn "Distribución no probada (${PRETTY_NAME:-$ID}). El script asume apt (Debian/Ubuntu)." ;;
  esac
}

check_cmd() { command -v "$1" >/dev/null 2>&1; }

ensure_pkg() {
  # ensure_pkg <comando> <paquete-apt> <nombre-bonito>
  local cmd="$1" pkg="$2" name="$3"
  if check_cmd "$cmd"; then ok "$name presente"; return; fi
  if $CHECK_ONLY; then warn "$name NO instalado"; MISSING=$((MISSING + 1)); return; fi
  log "Instalando $name…"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" >/dev/null
  ok "$name instalado"
}

ensure_docker() {
  if check_cmd docker; then ok "Docker presente"; else
    if $CHECK_ONLY; then warn "Docker NO instalado"; MISSING=$((MISSING + 1)); return; fi
    log "Instalando Docker…"
    curl -fsSL https://get.docker.com | sh >/dev/null
    systemctl enable --now docker >/dev/null 2>&1 || true
    ok "Docker instalado"
  fi
  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose (plugin) presente"
  else
    warn "Falta el plugin de Docker Compose"
    $CHECK_ONLY || { err "Reinstala Docker desde https://get.docker.com"; exit 1; }
    MISSING=$((MISSING + 1))
  fi
}

check_resources() {
  local mem_kb mem_mb disk_avail
  mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
  mem_mb=$((mem_kb / 1024))
  if [ "$mem_mb" -ge 1800 ]; then ok "RAM: ${mem_mb} MB"; else warn "RAM baja (${mem_mb} MB). Recomendado >= 2 GB."; fi
  disk_avail=$(df -Pm / | awk 'NR==2 {print $4}')
  if [ "${disk_avail:-0}" -ge 5000 ]; then ok "Disco libre: ${disk_avail} MB"; else warn "Poco disco libre (${disk_avail} MB). Recomendado >= 5 GB."; fi
}

check_ports() {
  for p in 80 443; do
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$p$"; then
      warn "El puerto $p ya está en uso (otra app podría chocar)."
    else
      ok "Puerto $p libre"
    fi
  done
}

open_firewall() {
  $CHECK_ONLY && return
  if check_cmd ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
    log "Abriendo puertos en ufw (22, 80, 443)…"
    ufw allow 22/tcp >/dev/null 2>&1 || true
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    ok "Firewall (ufw) configurado"
  fi
}

clone_repo() {
  if [ -d "$TARGET_DIR/.git" ]; then
    log "Actualizando repo en $TARGET_DIR…"
    git -C "$TARGET_DIR" fetch --depth 1 origin "$REPO_REF" >/dev/null 2>&1
    git -C "$TARGET_DIR" checkout "$REPO_REF" >/dev/null 2>&1
    git -C "$TARGET_DIR" reset --hard "origin/$REPO_REF" >/dev/null 2>&1
    ok "Repo actualizado ($REPO_REF)"
  else
    log "Descargando repo en $TARGET_DIR…"
    git clone --depth 1 -b "$REPO_REF" "$REPO_URL" "$TARGET_DIR" >/dev/null 2>&1
    ok "Repo descargado ($REPO_REF)"
  fi
}

set_env() {
  # set_env <CLAVE> <valor>  → reemplaza o añade la línea en .env
  local key="$1" val="$2" file="$TARGET_DIR/.env"
  if grep -q "^${key}=" "$file"; then
    # se usa | como separador de sed por si el valor lleva /
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >>"$file"
  fi
}

setup_env() {
  local file="$TARGET_DIR/.env"
  if [ ! -f "$file" ]; then
    cp "$TARGET_DIR/.env.example" "$file"
    set_env JWT_SECRET "$(openssl rand -hex 32)"
    set_env POSTGRES_PASSWORD "$(openssl rand -hex 16)"
    ok "Creado .env con secretos generados"
  else
    ok ".env ya existe (no se toca)"
  fi

  local domain
  domain="$(ask 'Dominio para la app (vacío = acceso por IP sin HTTPS): ')"
  if [ -n "$domain" ]; then
    set_env PUBLIC_DOMAIN "$domain"
    USE_TLS=true
    ok "Dominio: $domain (HTTPS con Caddy)"
  else
    set_env WEB_PORT 80
    USE_TLS=false
    ok "Sin dominio: la app responderá por HTTP en el puerto 80"
  fi

  echo
  warn "Revisa la configuración en: $file"
  warn "Para enviar emails (avisos de ausencia y soporte) rellena ahí SMTP_* y EMAIL_ENABLED=true."
  ask 'Pulsa Enter para desplegar (o Ctrl+C para editar el .env antes)… ' >/dev/null
}

deploy() {
  cd "$TARGET_DIR"
  log "Construyendo y levantando los contenedores (puede tardar unos minutos)…"
  if [ "${USE_TLS:-false}" = true ]; then
    docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
  else
    docker compose up -d --build
  fi
  ok "Despliegue lanzado"
}

print_done() {
  local url
  if [ "${USE_TLS:-false}" = true ]; then
    url="https://$(grep '^PUBLIC_DOMAIN=' "$TARGET_DIR/.env" | cut -d= -f2-)"
  else
    url="http://$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  echo
  ok "nuxoasist desplegado."
  echo "   Abre ${C_INFO}${url}${C_OFF} y completa el asistente de configuración inicial"
  echo "   (crear empresa y administrador). No hay usuarios de prueba en producción."
  echo
  echo "   Ver estado:   cd $TARGET_DIR && docker compose ps"
  echo "   Ver logs:     cd $TARGET_DIR && docker compose logs -f api"
}

main() {
  require_root
  echo "${C_INFO}== nuxoasist · doctor e instalador ==${C_OFF}"
  detect_os
  ensure_pkg git git Git
  ensure_pkg curl curl curl
  ensure_pkg openssl openssl OpenSSL
  ensure_docker
  check_resources
  check_ports

  if $CHECK_ONLY; then
    echo
    if [ "$MISSING" -eq 0 ]; then ok "Todo listo para instalar."; else warn "Faltan $MISSING requisito(s). Ejecuta sin --check para instalarlos."; fi
    exit 0
  fi

  open_firewall
  clone_repo
  setup_env
  deploy
  print_done
}

main "$@"
