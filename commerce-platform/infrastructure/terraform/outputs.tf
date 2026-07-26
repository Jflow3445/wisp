output "ecs_cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "database_endpoint" {
  value     = aws_rds_cluster.postgres.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive = true
}

output "files_bucket" {
  value = aws_s3_bucket.files.id
}

output "ecr_repositories" {
  value = { for name, repository in aws_ecr_repository.applications : name => repository.repository_url }
}
