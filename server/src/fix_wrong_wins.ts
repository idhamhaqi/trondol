import db from './config/database.js';

async function fixWrongWinnings() {
  console.log('[Script] Finding trades that won incorrectly due to global direction bug...');

  // Note: Only trades settled today (2026-03-10 trade date) have this issue
  const suspiciousTrades = await db`
    SELECT * FROM trades 
    WHERE result = 'win' AND settled_at >= CURDATE()
  `;

  for (const trade of suspiciousTrades) {
    const entry = parseFloat(trade.entry_price);
    const exit = parseFloat(trade.open_next_day);
    const side = trade.side;
    const amount = parseFloat(trade.amount);
    const reward = parseFloat(trade.reward);
    
    // Check real win logic
    const reallyWon = (side === 'up' && exit >= entry) || (side === 'down' && exit < entry);
    
    if (!reallyWon) {
      console.log(`[Script] Found wrong WIN: Trade ${trade.id} — Side: ${side}, Entry: ${entry}, Exit: ${exit}. Should be LOSS.`);
      
      // Need to deduct the incorrectly given reward AND the refunded principal
      // The previous script gave back principal + reward. Before that, it was just reward.
      // So the user currently has (balance + amount + reward) more than they should.
      // Since they LOST, they should lose their initial amount (already deducted at placeTrade), 
      // so we need to reverse the refund + reward.
      const toDeduct = amount + reward;
      
      console.log(`[Script] Reverting status to LOSS and deducting ${toDeduct} TRX from user ${trade.user_id}...`);
      
      await db`
        UPDATE trades 
        SET result = 'loss', reward = 0 
        WHERE id = ${trade.id}
      `;
      
      await db`
        UPDATE users 
        SET balance = balance - ${toDeduct} 
        WHERE id = ${trade.user_id}
      `;
      console.log(`[Script] Trade ${trade.id} fixed.`);
    } else {
      console.log(`[Script] Trade ${trade.id} is a legit WIN.`);
    }
  }

  console.log('[Script] Done.');
  process.exit(0);
}

fixWrongWinnings().catch(err => {
  console.error(err);
  process.exit(1);
});
