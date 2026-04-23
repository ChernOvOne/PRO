# HIDEYOU — VPN-платформа

> Личный кабинет для VPN-сервиса на базе [REMNAWAVE](https://docs.rw)
> Лендинг · Кабинет пользователя · Админ-панель · Telegram Mini App

---

## Что умеет

| | Возможность |
|---|---|
| 🔐 | Авторизация через **Telegram** и **Email** |
| 💳 | Оплата через **ЮKassa** (карты, СБП, ЮMoney) и **CryptoPay** (USDT, TON, BTC) |
| 👥 | **Реферальная программа** — бонусные дни за каждого приведённого друга |
| 📱 | **Telegram Mini App** — полноценный кабинет прямо в Telegram |
| 🔄 | **Автосинхронизация** с REMNAWAVE — подписка активируется сразу после оплаты |
| 📦 | **Импорт существующей базы** — привязка пользователей по email или Telegram ID |
| 🛠️ | **Админ-панель** — тарифы, инструкции, пользователи, платежи, аналитика |
| 📋 | **Инструкции по подключению** — пошагово для каждого устройства |
| 🐋 | Полностью **Dockerized** — разворачивается одной командой |

---

## Быстрая установка

```bash
git clone https://github.com/ChernOvOne/PRO hideyou
cd hideyou
chmod +x install.sh
sudo bash install.sh
```

Скрипт автоматически установит Docker, проведёт по настройке, выпустит SSL и запустит все сервисы.

---

## Меню управления

```bash
sudo bash install.sh              # интерактивное меню
sudo bash install.sh установить   # полная установка
sudo bash install.sh обновить     # обновить
sudo bash install.sh статус       # статус контейнеров
sudo bash install.sh логи         # просмотр логов
sudo bash install.sh резерв       # резервная копия
sudo bash install.sh остановить   # остановить сервисы
```

---

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                   Nginx (SSL/TLS)                   │
└──────────┬───────────────────────┬─────────────────┘
           │                       │
    ┌──────▼──────┐         ┌──────▼──────┐
    │  Фронтенд   │         │   Бэкенд    │
    │  Next.js 14 │◄────────│  Fastify    │
    └─────────────┘         └──────┬──────┘
                                   │
                    ┌──────────────┼──────────────┐
             ┌──────▼──────┐ ┌────▼────┐ ┌────────▼──────┐
             │ PostgreSQL  │ │  Redis  │ │  REMNAWAVE    │
             └─────────────┘ └─────────┘ └───────────────┘
```

---

## Структура проекта

```
hideyou/
├── install.sh              ← Начни отсюда
├── docker-compose.yml
├── .env.example
├── nginx/nginx.conf
├── backend/
│   ├── src/
│   │   ├── routes/         auth, users, payments, webhooks, admin
│   │   ├── services/       remnawave, payment, email, notifications
│   │   ├── bot/            Telegram-бот
│   │   └── scripts/        CLI-утилиты
│   └── prisma/schema.prisma
├── frontend/
│   └── src/app/
│       ├── page.tsx         Лендинг
│       ├── login/           Авторизация
│       ├── dashboard/       Личный кабинет
│       └── admin/           Админ-панель
└── scripts/
    ├── setup-server.sh      Подготовка нового сервера
    └── healthcheck.sh       Проверка состояния
```

---

## Импорт пользователей

Положи файл `./data/import.csv`:
```csv
email,telegram_id
user@example.com,123456789
,987654321
other@mail.ru,
```

Запусти в меню → **пункт 10** или:
```bash
sudo bash install.sh
# → пункт 10
```

Система найдёт каждого пользователя в REMNAWAVE по email или Telegram ID и привяжет подписку автоматически.

---

## Настройка оплаты

**ЮKassa:** зарегистрируйся на [yookassa.ru](https://yookassa.ru), получи Shop ID и секретный ключ, укажи webhook `https://домен/api/webhooks/yukassa`.

**CryptoPay:** открой `@CryptoBot` в Telegram → `/pay` → создай приложение, укажи webhook `https://домен/api/webhooks/cryptopay`.

---

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DOMAIN` | Твой домен (например `hideyou.app`) |
| `REMNAWAVE_URL` | URL панели REMNAWAVE |
| `REMNAWAVE_TOKEN` | API-токен из панели REMNAWAVE |
| `TELEGRAM_BOT_TOKEN` | Токен от `@BotFather` |
| `YUKASSA_SHOP_ID` | ID магазина ЮKassa |
| `YUKASSA_SECRET_KEY` | Секретный ключ ЮKassa |
| `CRYPTOPAY_API_TOKEN` | Токен от `@CryptoBot` |
| `REFERRAL_BONUS_DAYS` | Дней бонуса за реферала (по умолчанию: 30) |

---

## Обновление

```bash
sudo bash install.sh обновить
```

Скачивает новый код, пересобирает образы, применяет миграции и перезапускает сервисы.

---

## Резервное копирование

```bash
sudo bash install.sh резерв        # создать копию
sudo bash install.sh               # → пункт 13 для восстановления
```

---

## Технический стек

| Компонент | Технология |
|---|---|
| Бэкенд | Node.js 20, Fastify 4, TypeScript |
| Фронтенд | Next.js 14 (App Router), Tailwind CSS |
| База данных | PostgreSQL 16 + Prisma |
| Кеш | Redis 7 |
| Telegram-бот | grammy |
| Веб-сервер | Nginx |
| Деплой | Docker Compose |

---

## Локальная разработка

```bash
cd backend  && npm install && npm run dev   # http://localhost:4000
cd frontend && npm install && npm run dev   # http://localhost:3000
```

---

Сделано для VPN-сообщества ❤️
