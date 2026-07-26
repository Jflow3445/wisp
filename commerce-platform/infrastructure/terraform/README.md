# Terraform Baseline

This baseline provisions the marketplace VPC, multi-AZ Aurora PostgreSQL,
encrypted Redis, private object storage, ECS cluster, ECR repositories and an
application secret shell. It does not touch WISP infrastructure.

Before applying, add an approved remote state backend, review CIDRs/costs,
configure Cloudflare-facing load balancers and ECS services, and supply Auth0,
Paystack, maps and observability secrets through an approved secret workflow.
Never place provider credentials in Terraform variables or state.

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -var-file=environments/staging.tfvars
```

Production requires a reviewed plan, database restore test, migration plan,
rollback decision and two-person approval.
