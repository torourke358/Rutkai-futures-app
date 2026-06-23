"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

// Candlestick chart of the user's IMPORTED bars, with markers for entry, exit,
// and the MAE/MFE extremes plus optional stop/target price lines. Read-only
// visualization of history; lightweight-charts is Apache-2.0.

export interface Candle {
  time: number; // UNIX seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartMarker {
  time: number; // UNIX seconds
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "arrowUp" | "arrowDown" | "square";
  text: string;
}

export interface PriceLine {
  price: number;
  color: string;
  title: string;
}

export default function CandleChart({
  candles,
  markers = [],
  priceLines = [],
  height = 320,
}: {
  candles: Candle[];
  markers?: ChartMarker[];
  priceLines?: PriceLine[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    // Token-derived light palette so the chart reads like the rest of the app.
    const chart: IChartApi = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#5b6b82",
        fontFamily: "var(--font-jetbrains-mono), monospace",
      },
      grid: {
        vertLines: { color: "#eef2f9" },
        horzLines: { color: "#eef2f9" },
      },
      rightPriceScale: { borderColor: "#e3e9f2" },
      timeScale: { borderColor: "#e3e9f2", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScale: true,
      handleScroll: true,
    });

    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#15a66a",
      downColor: "#e0413e",
      borderUpColor: "#15a66a",
      borderDownColor: "#e0413e",
      wickUpColor: "#15a66a",
      wickDownColor: "#e0413e",
    });

    series.setData(
      candles.map(
        (c): CandlestickData<Time> => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }),
      ),
    );

    if (markers.length) {
      series.setMarkers(
        markers.map(
          (m): SeriesMarker<Time> => ({
            time: m.time as UTCTimestamp,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text,
          }),
        ),
      );
    }

    for (const pl of priceLines) {
      series.createPriceLine({
        price: pl.price,
        color: pl.color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: pl.title,
      });
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: Math.floor(w) });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, markers, priceLines, height]);

  if (candles.length === 0) {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-line bg-surface text-sm text-muted">
        No imported bars cover this window yet.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
