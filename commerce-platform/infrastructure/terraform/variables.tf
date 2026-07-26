variable "aws_region" {
  type        = string
  description = "AWS region for the marketplace environment."
  default     = "af-south-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "At least two AZs for high availability."
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two availability zones are required"
  }
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "allowed_ingress_cidrs" {
  type        = list(string)
  description = "Cloudflare or load-balancer ingress ranges approved for this environment."
  default     = []
}
