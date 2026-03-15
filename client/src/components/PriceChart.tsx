// ============================================
// PRICE CHART — TradingView Advanced Chart Widget
// FREE version, no API key needed
// Embeds directly from TradingView CDN
// Symbol: BINANCE:TRXUSDT
// ============================================

import React, { useEffect, useRef } from 'react';

interface Props {
  entryPrice?: number;
}

export default function PriceChart({ entryPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = '';

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    containerRef.current.appendChild(widgetContainer);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'BINANCE:TRXUSDT',
      interval: 'D',               // Default: Daily candle
      timezone: 'UTC',              // UTC timezone to match trading window
      theme: 'dark',
      style: '1',                  // Candlestick
      locale: 'en',
      backgroundColor: 'rgba(13, 15, 28, 0)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      container_id: 'tv_chart_container',
    });

    containerRef.current.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      id="tv_chart_container"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 300,
      }}
    />
  );
}
