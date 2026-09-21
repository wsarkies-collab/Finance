"use client";

import { useEffect } from "react";
import type { MomentumReport } from "@/lib/momentum";
import { ELEVATED_VOLATILITY_THRESHOLD } from "@/lib/momentum";
import { fmt } from "@/lib/format";

const SIGNAL_LABEL: Record<MomentumReport["signal"], string> = {
  new_entrant: "New entrant",
  held: "Held",
  dropped_out: "Dropped out",
};

interface MetricCard {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "warning";
  measures: string;
  meaning: string;
}

function momentumCard(r: MomentumReport): MetricCard {
  const m = r.momentum ?? 0;
  let meaning: string;
  if (m >= 0.3) {
    meaning =
      "A strong positive reading like this is exactly the pattern the research found tends to (modestly) continue over the next few months — but it's also the setup most exposed to a sudden momentum crash if sentiment reverses.";
  } else if (m >= 0) {
    meaning = "Positive but middling. It clears the bar for a momentum tailwind without being the standout case for it.";
  } else {
    meaning =
      "A negative reading here is a headwind for a momentum/continuation strategy specifically. Note this is a different, longer horizon from the shorter-term \"reversal\" effects the research treats as a separate phenomenon.";
  }
  return {
    label: "12–1 month momentum",
    value: r.momentum === null ? "n/a" : `${m >= 0 ? "+" : ""}${(m * 100).toFixed(1)}%`,
    tone: r.momentum === null ? undefined : m >= 0 ? "positive" : "negative",
    measures:
      "Price return from about 12 months ago to about 1 month ago, deliberately skipping the most recent month (Jegadeesh & Titman 1993; refinement by Novy-Marx 2012). One of the few technical-style signals with real, replicated academic support.",
    meaning,
  };
}

function proximityCard(r: MomentumReport): MetricCard {
  const p = (r.proximity ?? 0) * 100;
  let meaning: string;
  if (p >= 95) {
    meaning =
      "Trading right at its highs — the strongest form of this signal (George & Hwang 2004 found stocks near their 52-week high tend to keep outperforming, beyond what momentum alone predicts).";
  } else if (p >= 85) {
    meaning = "Close to its highs — a moderately supportive reading for this signal, though not the strongest form of it.";
  } else {
    meaning = "Meaningfully below its highs. This weakens the 52-week-high effect specifically, even if raw momentum still looks positive.";
  }
  return {
    label: "52-week high proximity",
    value: r.proximity === null ? "n/a" : `${p.toFixed(1)}% of high`,
    tone: r.proximity !== null && p >= 95 ? "positive" : undefined,
    measures:
      "Current price divided by the highest close in the trailing 52 weeks. Distinct from momentum — two stocks can have the same 12-month return while one sits at its high and the other is recovering from a deeper trough.",
    meaning,
  };
}

function roeSentence(roePct: number): string {
  if (roePct >= 25) {
    return `A Return on Equity this high (${roePct.toFixed(1)}%) means the company generates a large profit relative to shareholders' equity — often a sign of a strong competitive position or an efficient business model, though very high ROE can also come from heavy debt rather than genuine efficiency, so it's worth sanity-checking leverage separately.`;
  }
  if (roePct >= 12) {
    return `A Return on Equity of ${roePct.toFixed(1)}% is in the healthy, solidly-profitable range — not a standout, but not a warning sign either.`;
  }
  if (roePct >= 5) {
    return `A Return on Equity of ${roePct.toFixed(1)}% is modest — the business converts shareholder capital into profit less efficiently than a typical strong performer, which is common for capital-intensive industries but worth noting.`;
  }
  return `A Return on Equity this low (${roePct.toFixed(1)}%) signals weak profitability relative to the company's equity base — either a structurally tough business or one currently underperforming.`;
}

function peSentence(pe: number): string {
  if (pe >= 40) {
    return `A P/E this high (${pe.toFixed(1)}×) means the market is paying a large multiple of current earnings — usually because investors expect fast future growth, though it can also just mean current earnings are temporarily depressed. Either way, it leaves little room for disappointment.`;
  }
  if (pe >= 20) {
    return `A P/E of ${pe.toFixed(1)}× is a fairly full but unremarkable valuation — typical of an established, moderately-growing company rather than a bargain or a growth bet.`;
  }
  if (pe >= 10) {
    return `A P/E of ${pe.toFixed(1)}× is on the cheaper side — the market isn't pricing in much growth, which can mean the stock is undervalued or that growth expectations are genuinely low for a reason.`;
  }
  return `A P/E this low (${pe.toFixed(1)}×) is deep-value territory — it can mean the stock is cheap relative to its earnings, but a P/E this low is also the classic shape of a "value trap": worth checking why the market is pricing it so low before assuming it's a bargain.`;
}

function qualityValueCard(r: MomentumReport): MetricCard {
  const qv100 = r.qualityValuePct === null ? null : Math.round(r.qualityValuePct * 100);
  const roeMissing = r.roe === null;
  const peMissing = r.peRatio === null;
  const roeText = roeMissing ? "Not available" : roeSentence(r.roe! * 100);
  const peText = peMissing ? "Not available" : peSentence(r.peRatio!);

  let relative: string;
  if (qv100 === null) {
    relative = "No quality/value percentile could be computed for this ticker (missing both ROE and P/E).";
  } else if (qv100 >= 70) {
    relative =
      "Combined, that ranks in the top tier of this screen on profitability and cheapness together — the kind of pairing the research found combines well with momentum precisely because it's a largely independent signal.";
  } else if (qv100 >= 40) {
    relative =
      "Combined, that's roughly middle-of-the-pack versus the rest of this screen — the composite score here is leaning more on momentum and price strength than on fundamentals.";
  } else {
    relative =
      "Combined, that's one of the weaker readings in this screen. Its case for appearing here rests mostly on price momentum, not on cheapness or profitability.";
  }

  return {
    label: "Quality / value",
    value: `ROE ${roeMissing ? "n/a" : `${(r.roe! * 100).toFixed(1)}%`} · P/E ${peMissing ? "n/a" : r.peRatio!.toFixed(1)}`,
    sub: qv100 === null ? undefined : `${qv100}th percentile in this screen`,
    tone: qv100 === null ? undefined : qv100 >= 70 ? "positive" : qv100 < 40 ? "negative" : undefined,
    measures:
      "Return on Equity (profitability) and trailing P/E (cheapness) are the same raw fundamentals this app's long-term valuation screener already computes. The percentile blends both into one rank against the other names in this screen.",
    meaning: `${roeText} ${peText} ${relative}`,
  };
}

function compositeCard(r: MomentumReport): MetricCard {
  const c100 = r.compositeScore === null ? null : Math.round(r.compositeScore * 100);
  return {
    label: "Composite score",
    value: c100 === null ? "n/a" : `${c100} / 100`,
    tone: c100 === null ? undefined : c100 >= 70 ? "positive" : c100 < 40 ? "negative" : undefined,
    measures:
      "40% momentum percentile + 30% 52-week-high proximity percentile + 30% quality/value percentile, all ranked within this screen's universe.",
    meaning:
      'This is the single number the rank (and the "Signal" below) are built from — read the three components above for what\'s actually driving it rather than treating this score alone as a verdict.',
  };
}

function volatilityCard(r: MomentumReport): MetricCard {
  const vol = r.volatility;
  const elevated = vol !== null && vol >= ELEVATED_VOLATILITY_THRESHOLD;
  return {
    label: "3-month realized volatility",
    value: vol === null ? "n/a" : `${(vol * 100).toFixed(0)}% ann.${elevated ? " — elevated" : ""}`,
    tone: elevated ? "warning" : undefined,
    measures:
      "Annualized standard deviation of weekly returns over the trailing ~3 months — how large this stock's swings have been recently.",
    meaning: elevated
      ? 'Flagged because volatility here is elevated. Momentum strategies specifically have a documented history of sudden, severe drawdowns (a real ~65–73% three-month loss occurred in the 2009 "momentum crash") — that risk concentrates in exactly this kind of high-volatility name.'
      : "Volatility here is unremarkable for this group, so momentum-crash-style risk is comparatively lower — though never zero.",
  };
}

function signalCard(r: MomentumReport): MetricCard {
  const copy: Record<MomentumReport["signal"], string> = {
    new_entrant:
      'Just entered the top ranks this rebalance — the closest thing this screen offers to a "buy" flag. It reflects a rank crossing a threshold on real data, not a validated timing signal on its own.',
    held: "Remained in the top ranks — no new signal this period. The existing case for it is unchanged rather than freshly confirmed.",
    dropped_out:
      'Fell out of the top ranks — the closest thing this screen offers to a "sell" or de-prioritize flag. It does not mean the stock is bad, only that it no longer ranks among the strongest matches for this screen\'s momentum-plus-quality combination.',
  };
  return {
    label: "Signal",
    value: SIGNAL_LABEL[r.signal],
    tone: r.signal === "new_entrant" ? "positive" : r.signal === "dropped_out" ? "negative" : undefined,
    measures:
      "Derived purely from rank changes versus the prior rebalance — this screen's stand-in for a buy/sell trigger, built from the same evidence-backed composite score rather than a separate technical indicator like RSI or MACD.",
    meaning: copy[r.signal],
  };
}

export function MomentumExplainerModal({ report, onClose }: { report: MomentumReport; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const cards = [
    momentumCard(report),
    proximityCard(report),
    qualityValueCard(report),
    compositeCard(report),
    volatilityCard(report),
    signalCard(report),
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${report.ticker} figures explained`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{report.ticker}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="muted">
          {report.sector ?? "Unknown sector"} · Price: {fmt(report.price)}
        </p>
        <div className="modal-body">
          {cards.map((c) => (
            <div key={c.label} className="metric-row">
              <div className="metric-row-header">
                <strong>{c.label}</strong>
                <span className="metric-value-group">
                  <span className={c.tone ? `momentum-value ${c.tone}` : "momentum-value"}>{c.value}</span>
                  {c.sub ? <span className="metric-sub">{c.sub}</span> : null}
                </span>
              </div>
              <p className="muted metric-explanation">{c.measures}</p>
              <p className="metric-meaning">{c.meaning}</p>
            </div>
          ))}
        </div>
        <p className="muted modal-foot">Educational context to help interpret this screen — not investment advice.</p>
      </div>
    </div>
  );
}
