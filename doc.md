# Trondex — Comprehensive Project Documentation

Trondex is a decentralized-style trading platform built specifically for TRON (TRX). Users predict the direction of TRON's price over specific daily trading windows. This document outlines the technical architecture, data flow, structure, and development conventions of the project.

---

## 1. Tech Stack & Architecture

The application is structured as a **Monorepo** managed by **Bun workspaces** containing 3 primary packages:

1.  **`server/`** — Backend API (Bun + Hono)
2.  **`client/`** — Frontend (Vite + React + TypeScript)
3.  **`shared/`** — Types & constants shared between frontend and backend.

| Layer | Technology |
| :--- | :--- |
| **Runtime** | Bun |
| **HTTP Framework** | Hono |
| **Database** | MySQL 2 (via `mysql2/promise` connection pool) |
| **Cache / Session** | Redis (`ioredis`) |
| **Real-time** | Native Bun WebSockets |
| **Pub/Sub** | Redis Pub/Sub (for cross-instance broadcasting) |
| **Frontend** | React, Vite, TypeScript |
| **Wallet Auth** | TronLink (TRON network) |
| **Styling** | Vanilla CSS (`index.css`) with Glassmorphism UI |

### Development Setup
- **Run dev environment:** `bun run dev` (Concurrently runs server on `3001` and client on `3003`).

---

## 2. Directory Structure

```text
trondex/
├── server/src/
│   ├── index.ts               ← Entry point: Hono app + Bun.serve + WebSockets
│   ├── config/
│   │   ├── database.ts        ← MySQL connection pool + tagged template literal helper
│   │   └── redis.ts           ← Redis client + session management
│   ├── middleware/
│   │   ├── auth.ts            ← User auth middleware (Bearer token)
│   │   └── adminAuth.ts       ← Admin auth middleware (Returns 404 if invalid key)
│   ├── routes/                ← API route definitions (auth, trade, admin, etc.)
│   ├── services/
│   │   ├── dbInit.ts          ← Auto-creates tables on startup
│   │   ├── tradeManager.ts    ← Daily settlement, orderbook logic, trade execution
│   │   ├── priceManager.ts    ← Binance WS price feed (Leader node only)
│   │   ├── depositService.ts  ← TRON on-chain deposit verifier
│   │   ├── withdrawalService.ts ← Manual withdrawal queue processing
│   │   ├── insuranceService.ts← Insurance claim logic
│   │   ├── leaderElection.ts  ← Redis-based leader election for CRON jobs
│   │   └── redisPubSub.ts     ← Cross-instance websocket broadcasting
│   └── websocket/
│       └── handlers.ts        ← WS connection & messaging lifecycle
├── client/src/
│   ├── App.tsx                ← Application React Router setup & Providers
│   ├── context/
│   │   ├── ToastContext.tsx   ← Global Toast Notification System
│   │   ├── AuthContext.tsx    ← User session state
│   │   └── WebSocketContext.tsx ← WS connection management & data streams
│   ├── services/
│   │   ├── api.ts             ← HTTP request bindings (User API & Admin API)
│   │   └── wallet.ts          ← TronLink connection utilities
│   ├── pages/                 ← Route level components (Home, Admin, Portfolio, Referral)
│   └── components/            ← Reusable UI components (Modals, Charts, OrderBook)
└── shared/src/
    └── index.ts               ← Shared TypeScript interfaces & Protocol Constants
```

---

## 3. Database Schema

Tables are automatically generated on server startup via `server/src/services/dbInit.ts`.

- **`users`**: Stores `wallet_address`, `referral_code`, `balance`, `ref_bonus`, `insurance_days_remaining`.
- **`trades`**: Tracks all user predictions (`side: up/down`), `amount`, `entry_price`, and settlement `result` (win/loss/pending).
- **`daily_results`**: Historical ledger of open prices and the daily winning direction.
- **`deposits`**: Tracks raw on-chain TRON deposit attempts, tx hashes, and amounts.
- **`withdrawals`**: Manages manual withdrawal requests pending admin approval and processing.
- **`referrals`**: Links `referrer_id` to `referred_id` for the multi-level bonus structure.
- **`insurance_claims`**: Audit log of when users claimed standard or referral milestones insurance.
- **`bonus_transfers`**: Audit log of `ref_bonus` transfers into main `balance`.

---

## 4. Backend Patterns & Conventions

### Database Querying
The backend strictly uses **tagged template literals** (`db`...) for parameterized, SQL-injection-safe queries.

```typescript
// ✅ CORRECT: Parameters automatically escaped
const [user] = await db`SELECT * FROM users WHERE id = ${userId}`;

// ✅ CORRECT: Array in IN clause
const rows = await db`SELECT * FROM users WHERE id IN ${idsArray}`;

// ✅ CORRECT: Transactions with row locks
await db.transaction(async (tx) => {
  const [user] = await tx`SELECT balance FROM users WHERE id = ${userId} FOR UPDATE`;
  await tx`UPDATE users SET balance = ${newBalance} WHERE id = ${userId}`;
});
```

`db.unsafe()` is strictly reserved for DDL executions or internal integer limits/offsets. `db.execute()` is used when the number of affected rows is required.

### Leader Election
Certain recurring background tasks (e.g., listening to WebSocket price streams from Binance, settling daily trades) must only occur exactly once across the cluster. The `leaderElection.ts` service achieves this via Redis locks. Only the elected "Leader" node performs these sweeps.

### WebSockets & PubSub
- The application exposes a websocket on `ws://host/ws?token=<token>`.
- **Redis Pub/Sub** is used to tunnel realtime events across instances. For example, when a user completes a deposit on Node B, Node B publishes a `deposit_update` to Redis. The instance holding the user's active WebSocket connection receives the PubSub ping and forwards it to the client.

## 5. Frontend UI & UX Features

### Core Modules
- **Context Architecture**: The app state is heavily split into specific React Contexts. 
  - `AuthContext` tracks the cached wallet connection.
  - `WebSocketContext` automatically manages connection drops/reconnects and pushes the latest `price` & `orderBook` state to the UI.
  - `ToastContext` completely replaces standard `window.alert()` modals with an elegant, auto-dismissing DOM element stack (`useToast()`).
- **Admin Isolation**: The `AdminPage.tsx` interface is detached from the typical user `<Header>` and `<Footer>` layout wrappers, providing a seamless fullscreen dashboard experience for operational management.
- **Landing Page**: Implements a smooth CSS scroll-snapping (horizontal scroll override via mousewheel event listeners) to present a premium application feel.
- **Premium Aesthetics**: The application relies strictly on Vanilla CSS (`index.css`) utilizing dark mode, neon accents, and `backdrop-filter: blur` (glassmorphism) for a high-end visual appearance. 

---

## 6. Business Logic Flows

### Authentication
1. User connects TRON wallet via TronLink popup (`POST /api/auth/wallet-connect`).
2. Server creates a cryptographically secure token (`randomBytes(32)`), mapping it to the wallet address in Redis (`session:{token}`).
3. The JWT-like token is returned and stored in the client `localStorage`.

### Trading
- **Action**: Users predict whether the next day's open price will be HIGHER or LOWER than today's.
- **Reward**: Winning trades yield a flat 3% reward multiplier on the active wager.
- **Risk (Loss)**: Losing trades deduct **only 3%** from the wagered amount. The remaining 97% of the wager is returned to the user's balance.
- **Insurance**: A unique safety-net mechanism. If a user loses a trade but holds `insurance_days_remaining`, their 3% risk is covered and their **staked principal is returned 100%** at the cost of 1 insurance day.

### Withdrawals
- **Security Check**: For extreme security, withdrawing TRX is fully manual.
- Users request a withdrawal, which is queued as `pending`.
- Administrators view the queue in the Admin Panel and must manually send the equivalent TRX from the cold/hot wallet via TronLink.
- Upon sending, administrators copy the raw Transaction Hash and input it into the Admin Panel to mark the request as `completed`.

### Affiliates & Referrals
- `?ref=CODE` is actively parsed globally by `App.tsx` and cached. Once the user connects their wallet, the referrer code is injected into the registration payload.
- Referrers receive a direct 1% cut of the downline's trade principle continuously, pooled into `ref_bonus`.

---

## 7. Environment Variables

### Backend (`server/.env`)
```bash
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=trondex
REDIS_HOST=localhost
REDIS_PORT=6379
ADMIN_KEY=your_secure_admin_key_here
ADMIN_TRON_ADDRESS=TX_WALLET_ADDRESS_FOR_DEPOSITS
CORS_ORIGINS=http://localhost:3003
```

### Frontend (`client/.env`)
```bash
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_ADMIN_WALLET=TX_WALLET_ADDRESS_FOR_DEPOSITS
```
