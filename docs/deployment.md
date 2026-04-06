# Deployment Guide

## Prerequisites

- Ubuntu 22.04 LTS VPS (min 2 vCPU, 4 GB RAM, 40 GB SSD)
- A domain name pointing to your server's IP (A record)
- SSH access as root or a sudo user

---

## 1. Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## 2. Clone the Repository

```bash
git clone https://github.com/your-org/nexus-crm.git /opt/nexus-crm
cd /opt/nexus-crm
```

---

## 3. Configure Environment

```bash
cp crm-backend/.env.example crm-backend/.env
nano crm-backend/.env
```

**Minimum required for production:**

```bash
NODE_ENV=production
PORT=3001
APP_URL=https://your-domain.com
API_URL=https://your-domain.com/api
CORS_ORIGINS=https://your-domain.com

DATABASE_URL=postgresql://crm_user:STRONG_PASSWORD@postgres:5432/crm_db?schema=public
REDIS_URL=redis://redis:6379
MONGO_URI=mongodb://crm_mongo:STRONG_PASSWORD@mongodb:27017/crm_logs?authSource=admin

JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
```

Generate strong secrets:
```bash
openssl rand -hex 32   # run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET
```

---

## 4. Nginx Configuration

```bash
mkdir -p nginx/conf.d
```

Create `nginx/nginx.conf`:

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;
    sendfile on;
    keepalive_timeout 65;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    include /etc/nginx/conf.d/*.conf;
}
```

Create `nginx/conf.d/app.conf`:

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    # Frontend
    location / {
        proxy_pass         http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        rewrite            ^/api/(.*) /$1 break;
        proxy_pass         http://api:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass         http://api:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_read_timeout 86400;
    }
}
```

---

## 5. SSL with Certbot (First-Time)

```bash
# Start Nginx on HTTP first (needed for ACME challenge)
docker compose -f docker-compose.prod.yml up -d nginx

# Issue certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d your-domain.com \
  -d www.your-domain.com \
  --email admin@your-domain.com \
  --agree-tos \
  --no-eff-email

# Reload Nginx with SSL config
docker compose -f docker-compose.prod.yml restart nginx
```

---

## 6. Start All Services

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check status:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

---

## 7. Database Migration & Seed

```bash
# Run all pending migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Seed demo data (first run only)
docker compose -f docker-compose.prod.yml exec api npm run seed
```

---

## 8. Certificate Auto-Renewal

The `certbot` service in `docker-compose.prod.yml` renews automatically every 12 hours.

To force a manual renewal:
```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

Add to server crontab for belt-and-suspenders:
```bash
crontab -e
# Add:
0 3 * * 1 cd /opt/nexus-crm && docker compose -f docker-compose.prod.yml run --rm certbot renew && docker compose -f docker-compose.prod.yml restart nginx >> /var/log/certbot-renew.log 2>&1
```

---

## 9. Zero-Downtime Updates

Via CI/CD (recommended):
```bash
# Just merge to main — GitHub Actions handles the rest
```

Manual update:
```bash
cd /opt/nexus-crm
git pull origin main

docker compose -f docker-compose.prod.yml pull api web
docker compose -f docker-compose.prod.yml up -d --no-build --remove-orphans
docker compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy
docker image prune -f
```

---

## 10. Database Backups

### Automated daily backup

```bash
# /opt/backups/backup-db.sh
#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups/postgres
mkdir -p $BACKUP_DIR

docker compose -f /opt/nexus-crm/docker-compose.prod.yml exec -T postgres \
  pg_dump -U crm_user crm_db | gzip > "$BACKUP_DIR/crm_db_$TIMESTAMP.sql.gz"

# Keep 30 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup complete: crm_db_$TIMESTAMP.sql.gz"
```

```bash
chmod +x /opt/backups/backup-db.sh
crontab -e
# Add:
0 2 * * * /opt/backups/backup-db.sh >> /var/log/crm-backup.log 2>&1
```

### Restore from backup

```bash
gunzip -c /opt/backups/postgres/crm_db_20260401_020000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U crm_user -d crm_db
```

---

## 11. Monitoring

### Health endpoint

```bash
curl https://your-domain.com/api/health
# {"status":"ok","info":{...}}
```

### Container resource usage

```bash
docker stats --no-stream
```

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

---

## 12. Useful Commands

```bash
# Restart a single service without downtime
docker compose -f docker-compose.prod.yml restart api

# Enter running container
docker compose -f docker-compose.prod.yml exec api sh

# Run Prisma Studio (temporarily, remove after use)
docker compose -f docker-compose.prod.yml exec api npx prisma studio

# Check Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
docker compose -f docker-compose.prod.yml exec redis redis-cli info memory

# Tail all worker logs
docker compose -f docker-compose.prod.yml logs -f api | grep -E "Worker|Queue"
```
