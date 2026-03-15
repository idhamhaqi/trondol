// ============================================
// INSURANCE ROUTES — /api/insurance/*
// ============================================

import { Hono } from 'hono';
import type { DB } from '../config/database.js';
import {
  claimFreeInsurance,
  claimReferralInsurance,
  getInsuranceStatus,
} from '../services/insuranceService.js';

export function createInsuranceRoutes(db: DB): Hono {
  const app = new Hono();

  // GET /api/insurance/status
  app.get('/status', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const status = await getInsuranceStatus(userId);
      return c.json(status);
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /api/insurance/claim-free
  app.post('/claim-free', async (c) => {
    try {
      const userId = c.get('userId') as number;
      await claimFreeInsurance(userId);
      const status = await getInsuranceStatus(userId);
      return c.json({ success: true, ...status });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // POST /api/insurance/claim-referral
  app.post('/claim-referral', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const result = await claimReferralInsurance(userId);
      const status = await getInsuranceStatus(userId);
      return c.json({ success: true, daysAdded: result.daysAdded, ...status });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  return app;
}
