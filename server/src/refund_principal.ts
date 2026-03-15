// Quick script to refund missing principal for winning trades settled today with the bug
import db from './config/database.js';

async function refundMissingPrincipal() {
  console.log('[Script] Finding winning trades that missed principal refund...');
  const affectedTrades = await db`
    SELECT t.id, t.user_id, t.amount, t.reward, t.settled_at 
    FROM trades t
    WHERE t.result = 'win' AND t.settled_at >= CURDATE()
  `;

  if (affectedTrades.length === 0) {
    console.log('[Script] No affected trades found.');
    process.exit(0);
  }

  for (const trade of affectedTrades) {
    const amount = parseFloat(trade.amount);
    console.log(`[Script] Refunding ${amount} TRX to user ${trade.user_id} for winning trade ${trade.id}`);
    
    await db`UPDATE users SET balance = balance + ${amount} WHERE id = ${trade.user_id}`;
  }

  console.log('[Script] Refund complete.');
  process.exit(0);
}

refundMissingPrincipal().catch(err => {
  console.error(err);
  process.exit(1);
});
