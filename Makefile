# HIDEYOU — Makefile shortcuts
# Usage: make <command>

.PHONY: help install up down logs status update backup shell-backend shell-db migrate seed

help:
	@echo ""
	@echo "  HIDEYOU Development Commands"
	@echo "  ────────────────────────────────────────"
	@echo "  make install     Full install (interactive)"
	@echo "  make up          Start all services"
	@echo "  make down        Stop all services"
	@echo "  make restart     Restart all services"
	@echo "  make logs        Tail all logs"
	@echo "  make status      Show container status"
	@echo "  make update      Pull & rebuild"
	@echo "  make backup      Backup database"
	@echo "  make migrate     Run migrations"
	@echo "  make seed        Seed database"
	@echo "  make shell       Open backend shell"
	@echo "  make db          Open psql shell"
	@echo "  make redis       Open redis-cli"
	@echo "  make admin       Create admin account"
	@echo "  make import      Import users from CSV/JSON"
	@echo ""

install:
	@bash install.sh

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f --tail=100

logs-%:
	docker compose logs -f --tail=200 $*

status:
	@docker compose ps
	@echo ""
	@docker stats --no-stream \
		$(shell docker compose ps -q 2>/dev/null) 2>/dev/null || true

update:
	@bash install.sh update

backup:
	@bash install.sh backup

migrate:
	docker compose exec backend npx prisma migrate deploy

seed:
	docker compose exec backend node dist/scripts/seed.js

shell:
	docker compose exec backend sh

db:
	docker compose exec postgres psql -U hideyou hideyou

redis:
	docker compose exec redis redis-cli -a $$(grep REDIS_PASSWORD .env | cut -d= -f2)

admin:
	@bash install.sh
	# Select option 9

import:
	docker compose exec backend node dist/scripts/import-users.js

notify-expiry:
	docker compose exec backend node dist/scripts/notify-expiry.js

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

dev-tools:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile tools up

cron-sync:
	docker compose exec backend node dist/scripts/sync-subscriptions.js

cron-notify:
	docker compose exec backend node dist/scripts/notify-expiry.js

setup-cron:
	@echo "Add to crontab (run: crontab -e):"
	@echo "0 * * * * cd /opt/hideyou && docker compose exec -T backend node dist/scripts/sync-subscriptions.js >> /var/log/hideyou-sync.log 2>&1"
	@echo "0 9 * * * cd /opt/hideyou && docker compose exec -T backend node dist/scripts/notify-expiry.js >> /var/log/hideyou-notify.log 2>&1"
