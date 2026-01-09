'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Frame definitions
const FRAMES = [
  { id: '15m_01', timeframe: '15m', label: '15m #1', description: 'Short-term, high granularity' },
  { id: '15m_02', timeframe: '15m', label: '15m #2', description: 'Short-term, different sample' },
  { id: '1h_01', timeframe: '1h', label: '1h #1', description: 'Medium-term view' },
  { id: '1h_02', timeframe: '1h', label: '1h #2', description: 'Medium-term, different sample' },
  { id: '4h_01', timeframe: '4h', label: '4h #1', description: 'Long-term, fewer candles' },
  { id: '4h_02', timeframe: '4h', label: '4h #2', description: 'Long-term, different sample' },
];

interface FrameResult {
  frameId: string;
  accuracy: number;
  exactMatches: number;
  duration: number;
}

interface ModelResult {
  modelId: string;
  shortName: string;
  provider: string;
  cost: number;
  avgAccuracy: number;
  avgExactMatches: number;
  avgLatency: number;
  frames: FrameResult[];
}

// Base prompt shown to models
const SYSTEM_PROMPT = `You are an expert technical analyst evaluating candlestick charts.

Your task is to perform MULTI-STEP REASONING: combine multiple signals from the chart 
to reach compound trading conclusions.

For each field, you must synthesize information from:
- Price action (candle patterns, trend direction)
- Indicators (VWAP, Bollinger Bands, moving averages)
- Volume analysis
- Support/resistance levels

Think step by step before answering each field. Return ONLY valid JSON matching the schema.`;

const ROUND_PROMPT = `Analyze this {timeframe} candlestick chart for {symbolId}.
Current time: {currentTime}

The chart shows:
- Candlesticks (green = bullish, red = bearish)
- VWAP (Volume Weighted Average Price) - purple line
- Bollinger Bands (upper, middle, lower) - blue bands
- SMA(20) and EMA(20) - moving average lines
- Volume bars at bottom

**MULTI-STEP REASONING TASK**

Answer ALL fields with DEFINITE values (no null). For each field:

1. **uptrend_pullback_to_vwap** (BOOLEAN - must be true or false)
   - Is trend UP over last 10 candles? (>0.5% price increase)
   - Is price currently near VWAP? (within 0.3%)
   - TRUE only if BOTH conditions met, otherwise FALSE

2. **volatility_direction_combo** (ENUM - pick exactly one)
   - high_vol_bullish: Large candles + trending up
   - high_vol_bearish: Large candles + trending down
   - low_vol_drift_up: Small candles + slowly up
   - low_vol_drift_down: Small candles + slowly down
   - consolidation: Small candles + sideways

3. **tested_and_held_support** (BOOLEAN)
   - In last 5 candles: Did any candle wick below lower BB?
   - Did ALL those candles close ABOVE lower BB?
   - TRUE if support tested AND held, otherwise FALSE

4. **breakout_with_volume** (BOOLEAN)
   - Did LAST candle break above upper BB?
   - Is volume on that candle above the 10-candle average?
   - TRUE only if BOTH conditions met, otherwise FALSE

5. **potential_reversal_at_support** (BOOLEAN)
   - Did previous candle touch/wick below lower BB?
   - Is current candle bullish (green) AND closed higher?
   - TRUE if reversal pattern visible, otherwise FALSE

6. **overall_bias** (ENUM - count signals)
   - bullish: 3+ net bullish signals
   - mildly_bullish: 1-2 net bullish
   - neutral: balanced
   - mildly_bearish: 1-2 net bearish
   - bearish: 3+ net bearish

Also provide:
- **meta**: Read base_quote, venue, timeframe from chart
- **active_readout**: Read OHLC values from the rightmost candle

Return ONLY valid JSON. No commentary. Every boolean MUST be true or false.`;

export default function Home() {
  const [data, setData] = useState<{ models: ModelResult[]; lastUpdated: string; totalRuns?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/results')
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fallback data while loading
  const models = data?.models ?? [];
  const lastUpdated = data?.lastUpdated ?? new Date().toISOString();

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <header style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          007 Chart Reader Benchmark
        </h1>
        <p style={{ color: '#666', fontSize: 18 }}>
          Testing vision LLMs&apos; ability to read and interpret candlestick charts
        </p>
        <p style={{ color: '#999', fontSize: 14, marginTop: 8 }}>
          {data?.totalRuns && data.totalRuns > 1 
            ? `Average across ${data.totalRuns} benchmark runs`
            : `Last updated: ${new Date(lastUpdated).toLocaleString()}`
          } • Auto-updates daily
        </p>
      </header>

      {/* Section 1: Results Bar Chart */}
      <Section title="1. Benchmark Results">
        <p style={{ marginBottom: 24 }}>
          Accuracy scores for 6 vision models, ordered by cost (cheapest → most expensive).
        </p>
        
        {loading ? (
          <p>Loading results...</p>
        ) : (
          <>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={models} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="shortName" width={110} tick={{ fontSize: 13 }} />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Accuracy']}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="avgAccuracy" radius={[0, 4, 4, 0]}>
                    {models.map((entry, index) => (
                      <Cell key={index} fill={entry.avgAccuracy >= 50 ? '#2563eb' : '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <table style={{ marginTop: 24 }}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Cost ($/M)</th>
                  <th>Avg Accuracy</th>
                  <th>Exact Matches</th>
                  <th>Latency</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.modelId}>
                    <td><code>{model.shortName}</code></td>
                    <td>{model.provider}</td>
                    <td>${model.cost.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>{model.avgAccuracy.toFixed(1)}%</td>
                    <td>{model.avgExactMatches.toFixed(1)}/6</td>
                    <td>{Math.round(model.avgLatency)}ms</td>
                    <td>
                      <button 
                        onClick={() => setSelectedModel(selectedModel === model.modelId ? null : model.modelId)}
                        style={{ 
                          padding: '4px 8px', 
                          background: selectedModel === model.modelId ? '#1a1a1a' : '#f0f0f0',
                          color: selectedModel === model.modelId ? '#fff' : '#1a1a1a',
                          border: 'none', 
                          borderRadius: 4, 
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        {selectedModel === model.modelId ? 'Hide' : 'Show Frames'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* Per-Frame Accuracy (when a model is selected) */}
      {selectedModel && (
        <Section title={`Per-Frame Results: ${models.find(m => m.modelId === selectedModel)?.shortName}`}>
          <p style={{ marginBottom: 16 }}>
            Accuracy breakdown by timeframe and sample. Each frame tests the same 6 fields.
          </p>
          <table>
            <thead>
              <tr>
                <th>Frame</th>
                <th>Timeframe</th>
                <th>Accuracy</th>
                <th>Exact Matches</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {models.find(m => m.modelId === selectedModel)?.frames.map((frame) => {
                const frameDef = FRAMES.find(f => f.id === frame.frameId);
                return (
                  <tr key={frame.frameId}>
                    <td><code>{frameDef?.label}</code></td>
                    <td>{frameDef?.timeframe}</td>
                    <td style={{ 
                      fontWeight: 600,
                      color: frame.accuracy >= 60 ? '#16a34a' : frame.accuracy >= 40 ? '#ca8a04' : '#dc2626'
                    }}>
                      {frame.accuracy.toFixed(1)}%
                    </td>
                    <td>{frame.exactMatches}/6</td>
                    <td>{Math.round(frame.duration)}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* Section 2: Frames Explanation */}
      <Section title="2. Test Frames">
        <p style={{ marginBottom: 16 }}>
          Each model is tested on <strong>6 frames</strong> — different chart snapshots across 3 timeframes.
        </p>
        
        <table>
          <thead>
            <tr>
              <th>Frame</th>
              <th>Timeframe</th>
              <th>Description</th>
              <th>Candles Shown</th>
            </tr>
          </thead>
          <tbody>
            {FRAMES.map((frame) => (
              <tr key={frame.id}>
                <td><code>{frame.label}</code></td>
                <td>{frame.timeframe}</td>
                <td>{frame.description}</td>
                <td>~30 candles</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, marginTop: 16 }}>
          <p><strong>Why multiple frames?</strong></p>
          <ul style={{ paddingLeft: 24, marginTop: 8 }}>
            <li>Different timeframes test pattern recognition at different scales</li>
            <li>Multiple samples per timeframe reduce variance from lucky/unlucky charts</li>
            <li>15m has more candles (detail), 4h has fewer (big picture)</li>
          </ul>
        </div>
      </Section>

      {/* Section 3: Hypothesis */}
      <Section title="3. Hypothesis">
        <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 6, marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Primary Question:</p>
          <p style={{ fontSize: 18 }}>
            Can vision LLMs accurately extract structured trading signals from candlestick chart images?
          </p>
        </div>
        
        <h4 style={{ marginTop: 24, marginBottom: 12 }}>Sub-hypotheses:</h4>
        <ol style={{ paddingLeft: 24 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Perception:</strong> Models can read OHLC values and identify indicator lines
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Single Pattern:</strong> Models can identify individual patterns (trends, support/resistance)
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Multi-Step Reasoning:</strong> Models can combine multiple signals into compound conclusions
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Cost vs Performance:</strong> More expensive models perform proportionally better
          </li>
        </ol>
      </Section>

      {/* Section 4: Experiment Details */}
      <Section title="4. What We Test (6 Fields)">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Signals Combined</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>uptrend_pullback_to_vwap</code></td>
              <td>Trend direction + VWAP proximity</td>
              <td>Boolean</td>
            </tr>
            <tr>
              <td><code>volatility_direction_combo</code></td>
              <td>Candle size + Direction</td>
              <td>Enum (5 options)</td>
            </tr>
            <tr>
              <td><code>tested_and_held_support</code></td>
              <td>BB touch + Close location</td>
              <td>Boolean</td>
            </tr>
            <tr>
              <td><code>breakout_with_volume</code></td>
              <td>Price vs BB + Volume</td>
              <td>Boolean</td>
            </tr>
            <tr>
              <td><code>potential_reversal_at_support</code></td>
              <td>Support + Candle pattern</td>
              <td>Boolean</td>
            </tr>
            <tr>
              <td><code>overall_bias</code></td>
              <td>Synthesis of all signals</td>
              <td>Enum (5 options)</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Section 5: The Prompts */}
      <Section title="5. The Prompts">
        <h4>System Prompt</h4>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Sets the role and approach for the model:
        </p>
        <pre style={{ fontSize: 13 }}>{SYSTEM_PROMPT}</pre>

        <h4 style={{ marginTop: 24 }}>Round Prompt (per frame)</h4>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Sent with each chart image. Includes specific instructions for each field:
        </p>
        <pre style={{ fontSize: 12, maxHeight: 400, overflow: 'auto' }}>{ROUND_PROMPT}</pre>
        
        <p style={{ marginTop: 16, color: '#666', fontStyle: 'italic' }}>
          + Chart image is attached as a multimodal image part alongside the text prompt.
        </p>
      </Section>

      {/* Section 6: Setup */}
      <Section title="6. Setup & Architecture">
        <pre style={{ fontSize: 13 }}>{`007-chart-reader/
├── src/
│   ├── benchmark.ts      # Main CLI entry point
│   ├── chart-reader.ts   # Agent with multimodal prompt
│   ├── output-schema.ts  # Zod schema for predictions
│   ├── ground-truth/     # Compute truth from OHLCV
│   ├── scorers/          # Compare predictions vs truth
│   └── replay-lab/       # Fetch charts & data
├── website/              # This dashboard
│   └── app/api/
│       ├── results/      # GET benchmark results
│       └── cron/         # Auto-update every 2h
└── results/              # Per-model JSON outputs
    ├── google_gemini-2.5-flash-lite/
    │   ├── 15m_01.json
    │   ├── 15m_02.json
    │   └── ...
    └── ...`}</pre>

        <h4 style={{ marginTop: 24 }}>How It Works</h4>
        <ol style={{ paddingLeft: 24 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Fetch Chart:</strong> Get signed URL from Replay Labs API
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Send to Model:</strong> Multimodal prompt with chart image + instructions
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Parse Response:</strong> Extract structured JSON matching Zod schema
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Compute Ground Truth:</strong> Calculate expected values from raw OHLCV
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Score:</strong> Compare each field, calculate accuracy
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Save Results:</strong> Write JSON to <code>results/&lt;model&gt;/&lt;frame&gt;.json</code>
          </li>
        </ol>

        <h4 style={{ marginTop: 24 }}>Run Locally</h4>
        <pre>{`# Clone and install
git clone https://github.com/sanketagarwal/blue-benchmark
cd blue-benchmark/benchmarks/trading/007-chart-reader
pnpm install && pnpm build

# Run benchmark (6 dashboard models)
pnpm benchmark --dashboard --quick

# Or run specific tiers
pnpm benchmark --cheap --quick   # 3 cheap models
pnpm benchmark --expensive       # 3 frontier models`}</pre>
      </Section>

      {/* Section 7: Key Insights */}
      <Section title="7. Key Insights">
        <div style={{ display: 'grid', gap: 16 }}>
          <InsightCard
            title="Cost ≠ Performance (Linearly)"
            description="Gemini 2.5 Flash Lite ($0.38) achieves ~49% accuracy, while Claude Opus 4.5 ($30) only reaches ~56%. 80x cost increase yields only ~15% accuracy improvement."
            verdict="❌ Hypothesis partially rejected"
          />
          
          <InsightCard
            title="All Models Struggle with Multi-Step Reasoning"
            description="Even the best models only achieve ~55% accuracy. The hardest field is 'volatility_direction_combo' which requires assessing both candle size AND direction."
            verdict="⚠️ Significant room for improvement"
          />
          
          <InsightCard
            title="Cheapest Model is Surprisingly Competitive"
            description="Gemini 2.5 Flash Lite at $0.075/M input tokens achieves 88% of the best model's accuracy. For cost-sensitive applications, cheap models are viable."
            verdict="✅ Budget models are viable"
          />
          
          <InsightCard
            title="Latency Varies Wildly"
            description="Gemini 2.5 Flash (14s avg) is 8x slower than Gemini 2.5 Flash Lite (1.7s). Model version matters more than provider for speed."
            verdict="⚠️ Check latency requirements"
          />
        </div>

        <h4 style={{ marginTop: 32 }}>Best Model by Use Case</h4>
        <table>
          <thead>
            <tr>
              <th>Use Case</th>
              <th>Recommended Model</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Highest Accuracy</td>
              <td>Claude Opus 4.5</td>
              <td>~56% accuracy (best overall)</td>
            </tr>
            <tr>
              <td>Best Value</td>
              <td>Gemini 2.5 Flash Lite</td>
              <td>~49% at $0.38/M (best $/accuracy)</td>
            </tr>
            <tr>
              <td>Fastest Response</td>
              <td>Gemini 2.5 Flash Lite</td>
              <td>~1.7s average latency</td>
            </tr>
            <tr>
              <td>Balanced</td>
              <td>GPT-4o</td>
              <td>~53% accuracy, mid-tier cost</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Footer */}
      <footer style={{ marginTop: 64, paddingTop: 24, borderTop: '1px solid #e0e0e0', color: '#666', fontSize: 14 }}>
        <p>
          Built with Next.js • Data from Replay Labs • Models via Vercel AI Gateway
        </p>
        <p style={{ marginTop: 8 }}>
          <a href="https://github.com/sanketagarwal/blue-benchmark" style={{ textDecoration: 'underline' }}>
            View Source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #1a1a1a' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function InsightCard({ title, description, verdict }: { title: string; description: string; verdict: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, padding: 16 }}>
      <h4 style={{ fontWeight: 600, marginBottom: 8 }}>{title}</h4>
      <p style={{ color: '#666', marginBottom: 8 }}>{description}</p>
      <p style={{ fontWeight: 500 }}>{verdict}</p>
    </div>
  );
}
