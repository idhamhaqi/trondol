// ============================================
// DB INIT — Create all tables for trondex
// ============================================

import mysql from 'mysql2/promise';
import type { DB } from '../config/database.js';

export async function initDatabase(db: DB): Promise<void> {
  console.log('[DB] Initializing database tables...');

  // Step 1: bootstrap — create DB using a separate connection (no database selected)
  // because the main pool already points to 'trondex' which may not exist yet.
  const bootstrap = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'trondex'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();

  // ─── users ───────────────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id                        INT AUTO_INCREMENT PRIMARY KEY,
      wallet_address            VARCHAR(42) NOT NULL UNIQUE,
      referral_code             VARCHAR(12) NOT NULL UNIQUE,
      referred_by               INT DEFAULT NULL,
      balance                   DECIMAL(20,6) NOT NULL DEFAULT 0,
      ref_bonus                 DECIMAL(20,6) NOT NULL DEFAULT 0,
      insurance_days_remaining  INT NOT NULL DEFAULT 0,
      created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wallet (wallet_address),
      INDEX idx_referral_code (referral_code),
      CONSTRAINT fk_users_referred FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── trades ──────────────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS trades (
      id                VARCHAR(36) PRIMARY KEY,
      user_id           INT NOT NULL,
      trade_date        DATE NOT NULL,
      side              ENUM('up','down') NOT NULL,
      amount            DECIMAL(20,6) NOT NULL,
      entry_price       DECIMAL(20,8) NOT NULL,
      open_next_day     DECIMAL(20,8) DEFAULT NULL,
      result            ENUM('win','loss','pending') NOT NULL DEFAULT 'pending',
      reward            DECIMAL(20,6) DEFAULT NULL,
      insurance_used    TINYINT(1) NOT NULL DEFAULT 0,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      settled_at        TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_user_date (user_id, trade_date),
      INDEX idx_trade_date (trade_date),
      INDEX idx_result (result),
      CONSTRAINT fk_trades_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── daily_results ───────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS daily_results (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      trade_date    DATE NOT NULL UNIQUE,
      open_price    DECIMAL(20,8) NOT NULL,
      prev_close    DECIMAL(20,8) NOT NULL,
      direction     ENUM('up','down') NOT NULL,
      settled_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_trade_date (trade_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── deposits ────────────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS deposits (
      id              VARCHAR(36) PRIMARY KEY,
      user_id         INT NOT NULL,
      tx_hash         VARCHAR(80) NOT NULL UNIQUE,
      wallet_address  VARCHAR(42) NOT NULL,
      amount          DECIMAL(20,6) NOT NULL DEFAULT 0,
      raw_amount      VARCHAR(78) NOT NULL DEFAULT '0',
      status          ENUM('pending','confirmed','failed') NOT NULL DEFAULT 'pending',
      fail_reason     TEXT DEFAULT NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      confirmed_at    TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_user (user_id),
      INDEX idx_status (status),
      CONSTRAINT fk_deposits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── withdrawals ─────────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id              VARCHAR(36) PRIMARY KEY,
      user_id         INT NOT NULL,
      wallet_address  VARCHAR(42) NOT NULL,
      amount          DECIMAL(20,6) NOT NULL,
      tx_hash         VARCHAR(80) DEFAULT NULL,
      status          ENUM('pending','approved','processing','completed','rejected') NOT NULL DEFAULT 'pending',
      admin_note      TEXT DEFAULT NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at    TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_user (user_id),
      INDEX idx_status (status),
      CONSTRAINT fk_withdrawals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── referrals ───────────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS referrals (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      referrer_id   INT NOT NULL,
      referred_id   INT NOT NULL UNIQUE,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_referrer (referrer_id),
      CONSTRAINT fk_ref_referrer FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ref_referred FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── insurance_claims ────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS insurance_claims (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      user_id         INT NOT NULL,
      days_granted    INT NOT NULL DEFAULT 10,
      source          ENUM('free','referral') NOT NULL,
      referral_user_id INT DEFAULT NULL,
      claimed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      CONSTRAINT fk_ins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── bonus_transfers ─────────────────────────────────
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS bonus_transfers (
      id          VARCHAR(36) PRIMARY KEY,
      user_id     INT NOT NULL,
      amount      DECIMAL(20,6) NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      CONSTRAINT fk_bonus_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('[DB] All tables initialized successfully.');
}
