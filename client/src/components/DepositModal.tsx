// ============================================
// DEPOSIT MODAL — TRX Native Deposit via TronLink
// ============================================

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { sendTrxDeposit, isTronWebAvailable } from '../services/wallet.ts';
import { api } from '../services/api.ts';

const ADMIN_WALLET = import.meta.env.VITE_ADMIN_WALLET || '';

interface Props {
  onClose: () => void;
}

type Step = 'amount' | 'processing' | 'pending' | 'success' | 'failed';

export default function DepositModal({ onClose }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [finalAmount, setFinalAmount] = useState(0);
  const [failReason, setFailReason] = useState('');

  // Listen for real-time WebSocket deposit validations
  React.useEffect(() => {
    if (step !== 'pending') return;

    const handleWsMsg = (e: any) => {
      const msg = e.detail;
      if (msg?.type === 'deposit_update') {
        const data = msg.data;
        if (data?.status === 'confirmed') {
          setFinalAmount(data.amount);
          setStep('success');
        } else if (data?.status === 'failed') {
          setFailReason(data.reason || 'Verification failed. Please try again.');
          setStep('failed');
        }
      }
    };

    window.addEventListener('trondex_ws_message', handleWsMsg);
    return () => window.removeEventListener('trondex_ws_message', handleWsMsg);
  }, [step]);

  const handleDeposit = async () => {
    const trxAmount = parseFloat(amount);
    if (isNaN(trxAmount) || trxAmount < 10) {
      setError('Minimum deposit is 10 TRX');
      return;
    }

    if (!isTronWebAvailable()) {
      setError('TronLink extension is not detected. Please install it or use Klever/TokenPocket browser.');
      return;
    }

    setError('');
    setLoading(true);
    setStep('processing');

    try {
      // 1. Trigger tronWeb sendTransaction (popup TronLink is handled by the extension)
      const txHash = await sendTrxDeposit(ADMIN_WALLET, trxAmount);
      
      // 2. Jika sukses (user approve), kirim ke server untuk diverifikasi on-chain
      await api.submitDeposit(txHash, trxAmount);
      setStep('pending');
    } catch (err: any) {
      const msg = err.message || 'Unknown error';
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('reject')) {
        setStep('amount'); // User rejected, just go back to form
      } else {
        setError(msg);
        setStep('amount');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {step === 'amount' && (
          <>
            <div className="modal-title">💰 Deposit TRX</div>
            <div className="modal-subtitle">Transfer TRX on-chain via TronLink/TronWeb.</div>

            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 'var(--radius-md)', color: 'var(--red)', fontSize: '0.8rem', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Amount (TRX)</label>
              <div className="amount-input-wrapper">
                <input
                  className="amount-input"
                  type="number"
                  min="10"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  id="deposit-amount-input"
                />
                <span className="amount-input-unit">TRX</span>
              </div>
              <div className="quick-amounts">
                {[10, 50, 100, 500, 1000].map((v) => (
                  <button key={v} className="quick-btn" onClick={() => setAmount(String(v))}>+{v}</button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-full btn-lg" onClick={handleDeposit} disabled={loading || !amount}>
              {loading ? 'Please wait...' : 'Deposit via TronLink'}
            </button>
            <button style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }} onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </>
        )}

        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 16px', width: 40, height: 40 }} />
            <div className="modal-title">Awaiting confirmation...</div>
            <div className="modal-subtitle">Please confirm the transaction in your TronLink wallet / DApp browser.</div>
          </div>
        )}

        {step === 'pending' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
            <div className="modal-title">Verifying on-chain...</div>
            <div className="modal-subtitle">Your deposit is being verified by the server. Your balance will update automatically if the TX is valid.</div>
            <button className="btn btn-ghost btn-full" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: 16, color: 'var(--green)', animation: 'pop 0.3s ease-out' }}>✓</div>
            <div className="modal-title" style={{ color: 'var(--green)' }}>Deposit Confirmed!</div>
            <div className="modal-subtitle">
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', margin: '12px 0' }}>
                +{finalAmount.toFixed(4)} TRX
              </span>
              Your balance has been updated successfully.
            </div>
            <button className="btn btn-primary btn-full" style={{ marginTop: 24 }} onClick={onClose}>Done</button>
          </div>
        )}

        {step === 'failed' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: 16, color: 'var(--red)', animation: 'pop 0.3s ease-out' }}>✗</div>
            <div className="modal-title" style={{ color: 'var(--red)' }}>Verification Failed</div>
            <div className="modal-subtitle" style={{ marginTop: 12, padding: '12px', background: 'var(--red-dim)', borderRadius: 'var(--radius-md)', color: 'var(--red)' }}>
              {failReason}
            </div>
            <button className="btn btn-ghost btn-full" style={{ marginTop: 24 }} onClick={() => setStep('amount')}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
