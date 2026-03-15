import db from './config/database.js';

async function updateRefundedTrades() {
  console.log('[Script] Updating old insured loss trades to use the new "refunded" status...');

  // Find all trades that were losses but used insurance
  const refundedTrades = await db`
    SELECT id, user_id, amount
    FROM trades
    WHERE result = 'loss' AND insurance_used = 1
  `;

  if (refundedTrades.length === 0) {
    console.log('[Script] No insured loss trades found to migrate.');
    process.exit(0);
  }

  console.log(`[Script] Found ${refundedTrades.length} trades to update.`);

  for (const t of refundedTrades) {
    // We update the result string from 'loss' to 'refunded'
    // For these historical ones, we can just leave reward = 0 because it was a full principal refund.
    await db`
      UPDATE trades 
      SET result = 'refunded' 
      WHERE id = ${t.id}
    `;
    console.log(`[Script] Updated trade ${t.id} to status 'refunded'`);
  }

  console.log('[Script] Migration complete.');
  process.exit(0);
}

updateRefundedTrades().catch(err => {
  console.error(err);
  process.exit(1);
});
