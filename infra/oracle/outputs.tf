output "public_ip" {
  value       = oci_core_instance.app.public_ip
  description = "IP pública de la instancia"
}

output "ssh_command" {
  value       = "ssh ubuntu@${oci_core_instance.app.public_ip}"
  description = "Comando para entrar por SSH"
}

output "app_url" {
  value       = "http://${oci_core_instance.app.public_ip}"
  description = "URL de la app (tras desplegarla con docker compose)"
}
