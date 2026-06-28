# Despliegue en Oracle Cloud (IaC con Terraform)

Provisiona en Oracle Cloud (capa **Always Free**) una red completa y una instancia con
Docker instalado y el repo listo para desplegar. El despliegue de la app es **manual**
(un comando por SSH) y la app se sirve por **HTTP en la IP pública**.

Por defecto usa el shape **`VM.Standard.E2.1.Micro`** (x86, 1 GB RAM), que casi siempre
tiene disponibilidad. Para usar el **Ampere A1** (hasta 4 OCPU / 24 GB, ARM, pero suele
saturarse) define en `terraform.tfvars`:

```hcl
instance_shape = "VM.Standard.A1.Flex"
# ocpus = 4
# memory_in_gbs = 24
```

## Qué crea

- Red: VCN, Internet Gateway, tabla de rutas, *security list* (22, 80, 443) y subred pública.
- Instancia `${instance_shape}` con Ubuntu 22.04 (x86 o ARM según el shape) e IP pública.
- El `cloud-init` crea **3 GB de swap** (clave en el micro de 1 GB para que el build no se quede sin memoria).
- `cloud-init` instala Docker + compose, abre 80/443 en el firewall local, clona la rama
  configurable `repo_ref` (por defecto `main`, la versión estable) en `/opt/asist` y genera
  un `.env` con secretos aleatorios y `WEB_PORT=80`.

---

## 1. Lo que tienes que preparar tú (en tu cuenta de Oracle)

1. **Clave API** (consola OCI → tu perfil → *API keys* → *Add API key* → generar y descargar
   la clave privada `.pem`). Apunta el **fingerprint** que te muestra.
2. **OCIDs**: tenancy OCID y user OCID (perfil/tenancy details). El **compartment** puede ser
   el OCID de la tenancy (raíz).
3. **Región**: la de tu *home region* (p. ej. `eu-madrid-1`).
4. **Clave SSH**: si no tienes una, créala con `ssh-keygen -t ed25519`. Necesitarás el
   contenido del fichero `.pub`.
5. **Terraform** instalado ([descarga](https://developer.hashicorp.com/terraform/install)).

Copia la plantilla y rellénala:

```bash
cp terraform.tfvars.example terraform.tfvars
# edita terraform.tfvars con tus valores (queda git-ignored)
```

## 2. Levantar la infraestructura

```bash
cd infra/oracle
terraform init
terraform plan      # revisa lo que va a crear
terraform apply     # escribe 'yes' para confirmar
```

Al terminar verás las salidas `public_ip`, `ssh_command` y `app_url`.

> **Si falla con `Out of host capacity`**: la capacidad gratuita de Ampere es limitada y
> varía por *availability domain* y región. Reintenta el `apply`, o prueba otro AD añadiendo
> `availability_domain_index = 1` (o `2`) en `terraform.tfvars`.

## 3. Desplegar la app (manual, por SSH)

Espera ~2-3 min a que `cloud-init` termine (deja el fichero `/opt/asist/PREPARADO`).

```bash
ssh ubuntu@<public_ip>
cd /opt/asist
```

**Opción recomendada en el micro de 1 GB (sin compilar):** descarga las imágenes ya
publicadas en GHCR en lugar de construirlas (rápido y sin gastar memoria). Requiere que
los paquetes GHCR sean **públicos** (GitHub → repo → *Packages* → cada paquete →
*Package settings* → *Change visibility → Public*), o `docker login ghcr.io`.

```bash
export IMAGE_TAG=1.1.0
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
docker compose ps                                  # comprueba que están 'healthy'
```

**Alternativa (construir en la máquina):** funciona en instancias con más RAM (Ampere)
o en el micro gracias al swap, pero es lento:

```bash
docker compose up -d --build
```

La app queda en **http://<public_ip>**. La primera vez muestra el **asistente de
configuración**: el cliente crea ahí el nombre de su empresa y su cuenta de
administrador (no hay usuarios de prueba en producción). A partir de ese momento,
el acceso es por login normal y el admin da de alta a sus empleados.

## 4. (Más adelante) HTTPS con dominio

Cuando tengas un dominio apuntando (registro A) a la IP pública, en la instancia:

```bash
cd /opt/asist
echo "PUBLIC_DOMAIN=tudominio.com" >> .env
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
```

Caddy obtendrá el certificado automáticamente.

---

## Operación

```bash
docker compose logs -f api      # logs del backend
docker compose pull && docker compose up -d --build   # actualizar tras un git pull
terraform destroy               # (desde infra/oracle) eliminar TODO lo creado
```

## Qué necesito de ti para dejarlo funcionando

No necesito tus secretos (se quedan en tu `terraform.tfvars` local). Para guiarte hasta el
final, compárteme:

- La salida de `terraform plan` / `apply` (o el error si falla) y la **IP pública**.
- Si la app no responde: la salida de `ssh ... 'sudo cat /var/log/cloud-init-output.log'`
  y de `docker compose ps` / `docker compose logs api`.
