# Desplegar nuxoasist en una VPS

Guía para montar la app en cualquier VPS (Ubuntu/Debian) de forma sencilla. El
instalador comprueba los requisitos, los instala si faltan, descarga el código,
prepara la configuración y despliega todo con Docker.

## Requisitos de la VPS

- **Ubuntu 22.04 / 24.04 o Debian 12** (otras distros: el instalador asume `apt`).
- **2 GB de RAM** o más y ~5 GB de disco libre.
- Acceso **root o sudo** y los puertos **80** y **443** abiertos en el firewall del proveedor.
- (Para HTTPS) un **dominio** con un registro DNS **A** apuntando a la IP de la VPS.

## Instalación en 1 comando

Conéctate por SSH a la VPS y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/juanko6/asist_employed/main/scripts/install.sh -o nuxoasist-install.sh
sudo bash nuxoasist-install.sh
```

El instalador (modo "doctor") hará, en orden:

1. **Comprobar requisitos** e instalar lo que falte (Docker, Compose, git, curl, openssl).
2. **Abrir** los puertos 22/80/443 en `ufw` si está activo.
3. **Descargar** el repo en `/opt/nuxoasist`.
4. **Preparar el `.env`**: genera secretos (`JWT_SECRET`, `POSTGRES_PASSWORD`) y te
   pregunta el **dominio**. Aquí puedes pausar para editar el `.env` (p. ej. el SMTP).
5. **Desplegar** la app con Docker (con HTTPS automático si indicaste dominio).

Al terminar te muestra la URL. Ábrela y completa el **asistente de configuración**
(crear empresa y administrador). No se crean usuarios de prueba en producción.

> ¿Solo quieres diagnosticar la VPS sin instalar nada? `sudo bash nuxoasist-install.sh --check`

## Con dominio (HTTPS) o sin dominio (IP)

- **Con dominio**: cuando el instalador lo pregunte, escribe `asistencia.tucliente.com`.
  Caddy obtiene el certificado de Let's Encrypt automáticamente y la app queda en
  `https://asistencia.tucliente.com`. (El DNS debe apuntar ya a la IP.)
- **Sin dominio**: deja la pregunta vacía. La app responde en `http://IP-DE-LA-VPS`.
  Puedes añadir el dominio más tarde (ver abajo).

### Añadir el dominio después

En la VPS:

```bash
cd /opt/nuxoasist
echo "PUBLIC_DOMAIN=asistencia.tucliente.com" >> .env
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
```

## Emails (avisos de ausencia y soporte)

Para que se envíen correos (aviso de ausencias injustificadas y tickets de
soporte a `nuxoasist@gmail.com`), edita `/opt/nuxoasist/.env`:

```
EMAIL_ENABLED=true
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

y reinicia: `cd /opt/nuxoasist && docker compose up -d`.

## Operación

```bash
cd /opt/nuxoasist
docker compose ps                 # estado de los servicios
docker compose logs -f api        # logs del backend
```

### Actualizar a una versión nueva

```bash
sudo bash nuxoasist-install.sh    # vuelve a ejecutar: hace git pull + rebuild
```

### Backups (retención legal 4 años)

El servicio `backup` hace `pg_dump` a diario y guarda diarios/semanales/mensuales
en el volumen `asist_backups`. Para restaurar un dump, ver
[infra/oracle/README.md](../infra/oracle/README.md) y `scripts/restore.sh`.

## Problemas frecuentes

- **La web no carga** aunque el despliegue terminó: revisa que el proveedor de la
  VPS tenga abiertos los puertos 80/443 (firewall externo, no solo `ufw`).
- **HTTPS no obtiene certificado**: el dominio debe resolver a la IP de la VPS
  antes de levantar Caddy, y los puertos 80/443 deben estar accesibles.
- **Out of memory al construir**: usa una VPS con 2 GB+ de RAM.
