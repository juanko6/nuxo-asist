# Imagen oficial de Ubuntu 22.04 compatible con el shape elegido (ARM o x86)
data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "app" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  display_name        = var.instance_name
  shape               = var.instance_shape

  # ocpus/memoria solo aplican a los shapes Flex (p. ej. Ampere A1.Flex).
  # Los shapes fijos como E2.1.Micro no llevan shape_config.
  dynamic "shape_config" {
    for_each = strcontains(var.instance_shape, "Flex") ? [1] : []
    content {
      ocpus         = var.ocpus
      memory_in_gbs = var.memory_in_gbs
    }
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.subnet.id
    assign_public_ip = true
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(
      templatefile("${path.module}/cloud-init.yaml", { repo_ref = var.repo_ref })
    )
  }
}
