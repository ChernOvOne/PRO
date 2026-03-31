# Changelog

All notable changes to HIDEYOU will be documented in this file.

## [3.3.3] — 2026-03-31

### Автоворонки
- 40+ триггеров автоворонок: онбординг, подписка, оплата, рефералы, бонусы, вовлечение
- Цепочки шагов с условиями, действиями и задержками
- Движок автоворонок: выполнение по событиям, cron, подстановка переменных (60+)
- Типы задержек: сразу, минуты, часы, дни, точное время, след. день, по дням недели
- Кнопки бота в шагах: меню, URL, WebApp
- Действия: бонусные дни, пополнение баланса, промокоды (скидка / на баланс), пробный период
- Тест воронки — отправка всем админам с префиксом 🧪
- Полная документация по переменным в редакторе

### Коммуникации и рассылки
- Рассылки через Telegram-бот и Email с выбором аудитории
- Rich-редактор TG-сообщений: медиа (фото/видео/документ), кастомные эмоджи, спойлеры
- Опросы (polls) с live-статистикой голосов
- Email-шаблоны (dark/light), авто-генерация plain-text для улучшения доставляемости
- SMTP из БД: загрузка настроек из Settings если env пуст
- Валидация URL кнопок, корректная отправка медиа

### Telegram-бот
- Умный /start: активная подписка → меню, нет подписки → триал/тарифы
- Полная информация о подписке: дни, трафик, устройства, QR-код
- Инструкции из БД с deeplink-кнопками по платформам и приложениям
- Привязка email через бот
- Человекочитаемые callback-labels в истории чата

### Админ-панель
- Управление администраторами: приглашение по email/TG ID, список, отзыв
- Единый раздел «Коммуникации»: рассылки, воронки, настройки бота, чат
- Выборочное удаление пользователей (полное / только REMNAWAVE / только web / только бот)
- Тарифы: чекбоксы isVisible и isTrial
- Уведомления: цветовая маркировка по типу, удаление из админки
- Исправлены цвета выпадающих списков (dark bg для options/optgroups)

### Пробный период
- Отдельный триал-тариф с настройками видимости
- Экран активации триала, сохраняется до активации
- Email-шаблон для триала

### MiniApp
- Автологин: пропуск лендинга, сразу в дашборд
- Спиннер до завершения TMA-авторизации

### Рефералы
- Разделение триал и платных рефералов
- Корректные типы активности, список рефералов

### Прочее
- Кнопка выхода в профиле пользователя
- Исправлена регистрация: верификация email inline
- Корректный username REMNAWAVE: очистка от @ и спецсимволов

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
