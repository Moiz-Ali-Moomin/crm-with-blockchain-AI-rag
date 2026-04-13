# Production Deployment Architecture

## Deployment Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          GitHub Actions                                   │
│                                                                           │
│  push → main                                                              │
│     │                                                                     │
│     ▼                                                                     │
│  ┌─────────────────────────────────────┐                                 │
│  │              CI Workflow            │                                  │
│  │                                     │                                 │
│  │  backend-quality ──┐                │                                 │
│  │  backend-tests   ──┼─► build-and   │                                 │
│  │  frontend-quality──┘    -push       │                                 │
│  │                          │          │                                 │
│  │                   ┌──────┴──────┐   │                                 │
│  │                   │  GHCR       │   │                                 │
│  │                   │  crm-api:   │   │                                 │
│  │                   │   sha-abc12 │   │                                 │
│  │                   │  crm-web:   │   │                                 │
│  │                   │   sha-abc12 │   │                                 │
│  │                   └─────────────┘   │                                 │
│  └─────────────────────────────────────┘                                 │
│                          │ triggers                                       │
│                          ▼                                                │
│  ┌─────────────────────────────────────┐                                 │
│  │           CD Workflow               │                                 │
│  │                                     │                                 │
│  │  1. Resolve image tag (sha-abc12)   │                                 │
│  │  2. SSH → server                    │                                 │
│  └─────────────────────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────────┘
                          │ SSH
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Hetzner VPS                                        │
│                                                                           │
│  ┌──────────┐    ┌───────────────────────────────────────────────────┐  │
│  │  UFW     │    │                   Docker                           │  │
│  │  :443    │    │                                                    │  │
│  │  :80     │    │  ┌─────────────────────────────────────────────┐  │  │
│  │  :2222   │    │  │              NGINX (single instance)         │  │  │
│  └──────────┘    │  │              nginx -s reload (zero-downtime) │  │  │
│                  │  └──────┬──────────────────────┬───────────────┘  │  │
│                  │         │                       │                   │  │
│                  │  ┌──────▼──────┐       ┌───────▼──────┐           │  │
│                  │  │  BLUE slot  │       │  GREEN slot  │           │  │
│                  │  │             │       │              │           │  │
│                  │  │ crm_api_blue│       │crm_api_green │           │  │
│                  │  │ crm_web_blue│       │crm_web_green │           │  │
│                  │  │  (ACTIVE)   │       │   (IDLE)     │           │  │
│                  │  └─────────────┘       └──────────────┘           │  │
│                  │         │                       │                   │  │
│                  │  ┌──────▼───────────────────────▼───────────────┐  │  │
│                  │  │          Shared Infrastructure                 │  │  │
│                  │  │  postgres  │  redis  │  mongodb               │  │  │
│                  │  └───────────────────────────────────────────────┘  │  │
│                  │                                                      │  │
│                  │  ┌───────────────────────────────────────────────┐  │  │
│                  │  │           Observability                        │  │  │
│                  │  │  prometheus │ grafana │ loki │ promtail        │  │  │
│                  │  │  node-exporter │ cadvisor                      │  │  │
│                  │  └───────────────────────────────────────────────┘  │  │
│                  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Deploy sequence (step by step)

```
  IDLE slot = green (new version)
  ACTIVE slot = blue (current version, serving traffic)

  1. CI builds immutable image → sha-abc1234 → pushes to GHCR
  2. CD pulls sha-abc1234 onto server (no build on server)
  3. docker compose -f base -f green up -d     (green starts, not yet routed)
  4. health-check.sh polls green's INTERNAL port until 200
  5a. [Full deploy] nginx upstream → crm_api_green + crm_web_green → reload
  5b. [Canary]      nginx upstream → blue:90 + green:10 → reload
                    Monitor Grafana. Re-run CD with canary_weight=100 to promote.
  6. prod health check validates public HTTPS endpoint
  7. docker compose -f base -f blue down       (blue torn down)
  8. echo "green" > .active_slot
```

## GitHub Repository Secrets required

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Your VPS IP or hostname |
| `DEPLOY_USER` | Deploy Linux user (e.g. `deploy`) |
| `DEPLOY_SSH_KEY` | Private SSH key (the public key is on the server) |
| `DEPLOY_SSH_PORT` | SSH port (default `2222` after hardening) |
| `DEPLOY_PATH` | `/opt/crm` |
| `GHCR_USER` | GitHub username (for `docker login ghcr.io`) |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` scope |
| `NEXT_PUBLIC_API_URL` | `https://bestpurchasestore.com` |
| `NEXT_PUBLIC_APP_URL` | `https://bestpurchasestore.com` |

> These are used **only** at build time for Next.js. Runtime secrets live in
> `/opt/crm/.secrets` on the server (mode 600, never in git).

## First deploy (bootstrap)

```bash
# 1. One-time server setup (run as root on the VPS)
bash deploy/server-setup.sh deploy "ssh-ed25519 AAAA..."

# 2. Fill in real credentials
nano /opt/crm/.secrets

# 3. Clone the repo into the deploy path
cd /opt/crm
git clone https://github.com/YOUR_ORG/crm-with-blockchain-rag .

# 4. Start shared infrastructure
docker compose up -d postgres redis mongodb nginx prometheus grafana loki promtail node-exporter cadvisor postgres-backup

# 5. Generate initial nginx config (blue slot, since that's the default active)
ACTIVE_SLOT=blue envsubst < nginx/conf.d/single-slot.conf.template > nginx/conf.d/app.conf
docker exec crm_nginx nginx -s reload

# 6. Push to main - CI builds - CD deploys automatically
```

## Canary release workflow

```bash
# Deploy 10% of traffic to new version
gh workflow run cd.yml \
  -f image_tag=sha-abc1234 \
  -f canary_weight=10

# Watch the Grafana deployment dashboard:
#   https://bestpurchasestore.com/grafana/d/crm-deployment

# If metrics look good, promote to 100%
gh workflow run cd.yml \
  -f image_tag=sha-abc1234 \
  -f canary_weight=100

# If metrics look bad, rollback instantly:
gh workflow run cd.yml \
  -f image_tag=ROLLBACK \
  -f canary_weight=0
```

## Emergency rollback

Rollback is instantaneous because the previous slot is still running.
It is just an nginx config swap + reload — no container restarts.

```bash
# Via GitHub Actions UI: run the CD workflow with image_tag=ROLLBACK
# Or directly on the server:
ACTIVE=$(cat /opt/crm/.active_slot)
PREV=$([ "$ACTIVE" = "blue" ] && echo "green" || echo "blue")
ACTIVE_SLOT=$PREV envsubst < /opt/crm/nginx/conf.d/single-slot.conf.template \
  > /opt/crm/nginx/conf.d/app.conf
docker exec crm_nginx nginx -s reload
echo $PREV > /opt/crm/.active_slot
```

## Accessing Grafana

Grafana is NOT exposed publicly. Access via SSH tunnel:

```bash
ssh -L 3000:localhost:3000 -N deploy@bestpurchasestore.com -p 2222
# then open http://localhost:3000 in your browser
```

Or via the Nginx proxy at `https://bestpurchasestore.com/grafana/`
(requires adding your IP to an nginx `allow` list for security).

## Adding prom-client to the NestJS API

The Prometheus scrape config expects `/api/v1/metrics`. Add this to your backend:

```bash
cd crm-backend
npm install prom-client @willsoto/nestjs-prometheus
```

```typescript
// app.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/api/v1/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
})
export class AppModule {}
```

## Security checklist

- [ ] SSH port changed to 2222, password auth disabled
- [ ] UFW: only ports 80, 443, 2222 open
- [ ] Fail2ban running (`systemctl status fail2ban`)
- [ ] `/opt/crm/.secrets` is mode 600
- [ ] Grafana not exposed publicly (SSH tunnel or IP allowlist)
- [ ] Prometheus not exposed publicly
- [ ] Containers run as non-root (already in Dockerfiles)
- [ ] Docker `no-new-privileges: true` in daemon.json
- [ ] GHCR images are private (default for org repos)
- [ ] HSTS enabled in nginx
