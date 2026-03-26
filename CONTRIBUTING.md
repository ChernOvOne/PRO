# Contributing to HIDEYOU

## Project structure

```
hideyou/
├── install.sh          # Deploy & management CLI
├── Makefile            # Dev shortcuts
├── docker-compose.yml
├── .env.example
├── backend/            # Fastify API + Telegram Bot
│   ├── src/
│   │   ├── routes/     # HTTP endpoints
│   │   ├── services/   # remnawave, payment, email, notifications
│   │   ├── bot/        # Telegram bot (grammy)
│   │   └── scripts/    # CLI tools
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
└── frontend/           # Next.js 14
    └── src/
        ├── app/
        │   ├── (landing)     # Public landing
        │   ├── dashboard/    # User cabinet
        │   ├── admin/        # Admin panel
        │   └── login/
        ├── components/ui/    # Reusable components
        ├── lib/api.ts        # Typed API client
        ├── hooks/            # React hooks
        └── types/            # TypeScript types
```

## Local development

```bash
# 1. Copy env
cp .env.example .env
# Fill in REMNAWAVE_URL, REMNAWAVE_TOKEN, TELEGRAM_BOT_TOKEN at minimum

# 2. Start infra only
docker compose up -d postgres redis

# 3. Run backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev   # http://localhost:4000

# 4. Run frontend (new terminal)
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Secrets for GitHub Actions

Add these to your repo → Settings → Secrets → Actions:

| Secret | Description |
|---|---|
| `SSH_HOST` | Server IP or hostname |
| `SSH_USER` | SSH user (e.g. `ubuntu`) |
| `SSH_PRIVATE_KEY` | Private SSH key |
| `SSH_PORT` | SSH port (default 22) |

## Adding a new payment provider

1. Create `backend/src/services/providers/yourprovider.ts`
2. Add to `PaymentService` in `payment.ts`
3. Add provider enum value in `schema.prisma`
4. Add UI tab in `frontend/src/app/dashboard/plans/page.tsx`
5. Add webhook handler in `routes/webhooks.ts`

## Database migrations

```bash
# Create new migration (dev)
cd backend && npx prisma migrate dev --name your_migration_name

# Apply in production (done automatically by install.sh update)
npx prisma migrate deploy
```

## Code style

- TypeScript strict mode everywhere
- No `any` except in gradual migration contexts
- Zod for all request validation
- All DB queries through Prisma — no raw SQL except analytics
