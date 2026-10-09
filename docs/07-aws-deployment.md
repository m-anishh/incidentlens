# 07 — AWS deployment

Brought forward from step 8 because the dev machine has no Docker. It runs the
same `docker-compose.yml`, unchanged.

| Item | Value |
|---|---|
| Region | eu-north-1 |
| Instance | `i-073f2f0b7ce8dd819`, `m7i-flex.large` (2 vCPU, 8 GB), free-tier eligible |
| AMI | Ubuntu 24.04 (SSM parameter `/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id`) |
| Disk | 30 GB gp3 |
| Security group | `sg-0c653169f3a13fbd1` (`incidentlens-ssh`): port 22 only, from the owner's ISP range |
| Key pair | `incidentlens` (ed25519), private key at `~/.ssh/incidentlens.pem` |
| IMDS | v2 required |
| Docker | Installed by user data (`get.docker.com`) |
| IAM role | `incidentlens-ec2`: `bedrock:InvokeModel*` on foundation models and inference profiles, nothing else |
| IMDS hop limit | 2, so containers can reach instance credentials |

## Why this instance type

`m7i-flex.large` was the only free-tier type with 8 GB of memory. Burstable
`t3`/`t4g` types would run out of CPU credits under constant load generation,
and the throttling would look like latency incidents.

## Access

No UI port is open to the internet: Grafana is anonymous admin and the agent
API has no auth. Use an SSH tunnel:

```sh
ssh -i ~/.ssh/incidentlens.pem \
  -L 3000:localhost:3000 -L 3001:localhost:3001 -L 8080:localhost:8080 \
  -L 9090:localhost:9090 -L 9093:localhost:9093 \
  ubuntu@<public-ip>
```

The owner's ISP rotates the IP within a /24, so SSH is allowed from that /24
rather than from a single address. If it moves outside that range, update the
security group rule. A better long-term fix is SSM Session Manager, which needs
no inbound port.

## Deploying a change

```sh
scp -i ~/.ssh/incidentlens.pem <file> ubuntu@<ip>:~/incidentlens/<path>
ssh ... 'cd ~/incidentlens && docker compose up -d --build <service>'
```

Replace this with `git pull` once the repo is on GitHub.

## LLM

Bedrock, `deepseek.v3.2`, paid from the account's Free-plan credits (no card
charge on the Free plan). Claude and OpenAI models on Bedrock are refused for
Free-plan accounts (they go through AWS Marketplace); the open-weight models
are not. Tested working: DeepSeek V3.2, Qwen3 235B, gpt-oss-120b, Kimi K2.5,
GLM-5, Nova Pro. Change with `BEDROCK_MODEL` in `.env`.

## Secrets

`.env` exists only on the instance (mode 600), with random database
passwords. `ANTHROPIC_API_KEY` must be added there by hand; it is never
committed or copied from the dev machine.

## Cost

The public IPv4 address is billed by the hour even inside the free tier; check
the account's free-tier dashboard. Stop the instance when it's idle: it then
costs only the EBS volume, and the public IP changes on the next start.
