# --- Credenciales de la API de OCI (las obtienes en la consola de Oracle) ---
variable "tenancy_ocid" {
  type        = string
  description = "OCID de la tenancy"
}

variable "user_ocid" {
  type        = string
  description = "OCID del usuario"
}

variable "fingerprint" {
  type        = string
  description = "Fingerprint de la clave API"
}

variable "private_key_path" {
  type        = string
  description = "Ruta local a la clave privada API (.pem)"
}

variable "region" {
  type        = string
  description = "Región de OCI (p. ej. eu-madrid-1, eu-frankfurt-1)"
}

variable "compartment_ocid" {
  type        = string
  description = "OCID del compartimento donde crear los recursos (puedes usar el de la tenancy)"
}

# --- Acceso e instancia ---
variable "ssh_public_key" {
  type        = string
  description = "Clave SSH pública para entrar a la instancia (contenido de tu .pub)"
}

variable "instance_name" {
  type        = string
  default     = "asist-prod"
  description = "Nombre base de los recursos"
}

variable "availability_domain_index" {
  type        = number
  default     = 0
  description = "Índice del Availability Domain (0/1/2). Si da 'Out of host capacity', prueba otro."
}

variable "ocpus" {
  type        = number
  default     = 4
  description = "OCPUs del Ampere A1 (4 = tope de la capa gratuita)"
}

variable "memory_in_gbs" {
  type        = number
  default     = 24
  description = "RAM en GB (24 = tope de la capa gratuita)"
}

variable "boot_volume_size_in_gbs" {
  type        = number
  default     = 50
  description = "Tamaño del disco de arranque"
}

variable "ssh_ingress_cidr" {
  type        = string
  default     = "0.0.0.0/0"
  description = "Origen permitido para SSH (22). Restríngelo a TU_IP/32 para más seguridad."
}

variable "repo_ref" {
  type        = string
  default     = "main"
  description = "Rama o etiqueta del repo a desplegar (main = versión estable)."
}
