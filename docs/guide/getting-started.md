# Getting Started with Proxmotion

This guide walks you through deploying the Proxmotion panel and connecting your first Proxmox VE cluster.

## System Requirements

- **PHP**: 8.2 or 8.3 with standard extensions (`bcmath`, `curl`, `gmp`, `mbstring`, `openssl`, `pdo_sqlite` or `pdo_mysql`, `redis`)
- **Database**: SQLite (WAL mode) or MariaDB / MySQL 8.0+
- **Cache & Queue**: Redis (required for asynchronous task pipelines and WebSockets)
- **Web Server**: Nginx or Caddy with PHP-FPM
- **Proxmox VE**: Version 7.4 or 8.x with API token permissions

## Installation Steps

### 1. Panel Setup
```bash
git clone https://github.com/proxmotion-devs/proxmotion.git /var/www/proxmotion
cd /var/www/proxmotion/panel
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
```

### 2. Database & Migrations
```bash
php artisan migrate --force
php artisan db:seed --force
```

### 3. Queue Worker & Scheduler
Configure systemd or supervisor to run:
- Queue worker: `php artisan queue:work --sleep=1 --tries=3`
- Scheduler: `php artisan schedule:run` (cron every minute)

### 4. Connect Proxmox Cluster
1. Open Admin Panel: `https://panel.yourdomain.com`
2. Navigate to **Infrastructure > Clusters > Add Cluster**.
3. Fill in API host, token ID, and secret.
4. Run health check to discover nodes, storages, and networks.
