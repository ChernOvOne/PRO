# Changelog

All notable changes to HIDEYOU will be documented in this file.

## [1.0.0] — Initial Release

### Features
- **Landing page** — tariffs, features, FAQ, CTA
- **User dashboard** — subscription status, QR code, referrals, payment history
- **Authentication** — Telegram Login Widget, Telegram Mini App, Email/password
- **Payments** — ЮKassa (cards, СБП, ЮMoney) + CryptoPay (USDT, TON, BTC)
- **Referral program** — auto bonus days per successful referral
- **REMNAWAVE integration** — full subscription lifecycle management
- **User import** — bulk match existing users by email or Telegram ID
- **Admin panel** — users, tariffs, instructions, payments, analytics, settings
- **Telegram Bot** — notifications, /status, /sub, /ref commands
- **Email notifications** — payment confirmation, expiry warnings
- **Docker Compose** — one-command deployment
- **install.sh** — interactive CLI with 16 management options
- **CI/CD** — GitHub Actions with container registry and SSH deploy
- **Cron jobs** — subscription sync, expiry notifications

### Infrastructure
- Fastify 4 + TypeScript backend
- Next.js 14 App Router frontend
- PostgreSQL 16 + Redis 7
- Nginx with SSL/TLS 1.3
- Full text search on user base
- Rate limiting on all endpoints

---

*Format: [Semantic Versioning](https://semver.org/)*
