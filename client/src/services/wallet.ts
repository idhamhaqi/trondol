// ============================================
// WALLET SERVICE — TRON Native (TronWeb / TronLink)
// ============================================

// Extend Window interface for tronWeb
declare global {
  interface Window {
    tronWeb: any;
    tronLink: any;
  }
}

let activeAddress: string | null = null;

/**
 * Cek apakah TronWeb/TronLink terinstall dan siap digunakan
 */
export function isTronWebAvailable(): boolean {
  return !!(window.tronWeb && window.tronWeb.ready);
}

/**
 * Trigger pop-up koneksi di extension TronLink
 */
export async function connectWallet(): Promise<string> {
  // 1. Pastikan objek ada
  if (!window.tronWeb) {
    throw new Error('TronLink extension or TRON DApp Browser is not detected. Please install TronLink or use Klever/TokenPocket browser.');
  }

  // 2. Request TronLink untuk menghubungkan akun
  if (window.tronLink && window.tronLink.request) {
    try {
      const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
      if (res.code === 200 || res.code === 20000) {
        // Berhasil connect
      } else {
        throw new Error(res.message || 'User rejected the connection request');
      }
    } catch (err: any) {
      // Jika request gagal
      if (err.message && err.message.includes('rejected')) {
        throw new Error('User rejected the connection request');
      }
      console.warn('tronLink.request failed or unsupported, fallback to tronWeb checking...', err);
    }
  }

  // 3. Ambil address yang aktif (jika sudah di-unlock)
  const address = window.tronWeb.defaultAddress?.base58;
  if (!address) {
    throw new Error('TronLink is locked or no account is selected. Please open the extension and unlock it.');
  }

  activeAddress = address;
  return address;
}

/**
 * Logout dari website (dihapus dari local state)
 */
export async function disconnectWallet(): Promise<void> {
  activeAddress = null;
  // TronWeb tidak punya fungsi disconnect eksplisit yang memaksa wallet logout
  // Pemutusan asli hanya bisa dilakukan dari dalam extension TronLink itu sendiri.
}

/**
 * Mengirim transaksi native TRX menggunakan window.tronWeb
 * @param toAddress Alamat tujuan (misal: ADMIN_WALLET)
 * @param amount Jumlah TRX (misal: 10)
 * @returns txHash (String)
 */
export async function sendTrxDeposit(toAddress: string, amount: number): Promise<string> {
  if (!window.tronWeb) {
    throw new Error('TronWeb is not initialized. Please connect your wallet first.');
  }

  // Cek ulang address aktif
  const fromAddress = window.tronWeb.defaultAddress?.base58;
  if (!fromAddress) {
    throw new Error('No active account found. Please unlock TronLink.');
  }

  try {
    // tronWeb.trx.sendTransaction otomatis konversi amount ke SUN (jika string/integer sesuai versi, namun aman pakai SUN manual kalau raw)
    // Untuk method trx.sendTransaction, parameternya di TronLink biasanya disarankan sendtrx atau transfer pakai "amount in SUN".
    
    // Namun API build-in yg paling standard adalah `window.tronWeb.trx.sendTransaction(to, amountInSun)`
    const amountInSun = Math.round(amount * 1_000_000); // 1 TRX = 10^6 SUN
    
    // Ini akan men-trigger popup di TronLink untuk minta tanda tangan user
    const tx = await window.tronWeb.trx.sendTransaction(toAddress, amountInSun);
    
    if (tx && tx.result) {
      return tx.txid || tx.transaction?.txID; // Bergantung versi TronWeb, response bisa tx.txid atau tx.transaction.txID
    }
    
    throw new Error('Transaction failed or rejected by network');
  } catch (error: any) {
    const msg = typeof error === 'string' ? error : (error.message || '');
    if (msg.toLowerCase().includes('decline') || msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }
    throw error;
  }
}
