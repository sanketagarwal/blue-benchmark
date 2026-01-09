'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// 6 models in increasing order of cost
const BENCHMARK_DATA = [
  {
    id: 'google/gemini-2.5-flash-lite',
    shortName: 'Gemini 2.5 Flash Lite',
    provider: 'Google',
    cost: 0.375, // $/M tokens (input + output avg)
    accuracy: 48.6,
    exactMatches: 2.5,
    successRate: '6/6',
    avgLatency: 1665,
  },
  {
    id: 'openai/gpt-4o-mini',
    shortName: 'GPT-4o Mini',
    provider: 'OpenAI',
    cost: 0.75,
    accuracy: 44.4,
    exactMatches: 2.7,
    successRate: '6/6',
    avgLatency: 3200,
  },
  {
    id: 'google/gemini-2.0-flash',
    shortName: 'Gemini 2.0 Flash',
    provider: 'Google',
    cost: 0.50,
    accuracy: 43.1,
    exactMatches: 2.3,
    successRate: '6/6',
    avgLatency: 3400,
  },
  {
    id: 'google/gemini-2.5-flash',
    shortName: 'Gemini 2.5 Flash',
    provider: 'Google',
    cost: 0.75,
    accuracy: 44.4,
    exactMatches: 2.7,
    successRate: '6/6',
    avgLatency: 14265,
  },
  {
    id: 'openai/gpt-4o',
    shortName: 'GPT-4o',
    provider: 'OpenAI',
    cost: 12.50,
    accuracy: 52.8,
    exactMatches: 3.2,
    successRate: '6/6',
    avgLatency: 4500,
  },
  {
    id: 'anthropic/claude-opus-4-5',
    shortName: 'Claude Opus 4.5',
    provider: 'Anthropic',
    cost: 30.00,
    accuracy: 55.6,
    exactMatches: 3.3,
    successRate: '6/6',
    avgLatency: 8200,
  },
];

const LAST_UPDATED = new Date().toISOString();

export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <header style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          007 Chart Reader Benchmark
        </h1>
        <p style={{ color: '#666', fontSize: 18 }}>
          Testing vision LLMs&apos; ability to read and interpret candlestick charts
        </p>
        <p style={{ color: '#999', fontSize: 14, marginTop: 8 }}>
          Last updated: {new Date(LAST_UPDATED).toLocaleString()} • Auto-updates every 2 hours
        </p>
      </header>

      {/* Section 1: Results Bar Chart */}
      <Section title="1. Benchmark Results">
        <p style={{ marginBottom: 24 }}>
          Accuracy scores for 6 vision models, ordered by cost (cheapest → most expensive).
        </p>
        
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={BENCHMARK_DATA} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="shortName" width={110} tick={{ fontSize: 13 }} />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Accuracy']}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                {BENCHMARK_DATA.map((entry, index) => (
                  <Cell key={index} fill={entry.accuracy >= 50 ? '#2563eb' : '#64748b'} />
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
              <th>Accuracy</th>
              <th>Exact Matches</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {BENCHMARK_DATA.map((model) => (
              <tr key={model.id}>
                <td><code>{model.shortName}</code></td>
                <td>{model.provider}</td>
                <td>${model.cost.toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>{model.accuracy.toFixed(1)}%</td>
                <td>{model.exactMatches}/6</td>
                <td>{model.avgLatency}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Section 2: Hypothesis */}
      <Section title="2. Hypothesis">
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

      {/* Section 3: Experiment Details */}
      <Section title="3. Experiment Details">
        <h4>What We Test (6 Fields)</h4>
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

        <h4 style={{ marginTop: 24 }}>Test Matrix</h4>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong>Symbol:</strong> COINBASE_SPOT_BTC_USD</li>
          <li><strong>Timeframes:</strong> 15m, 1h, 4h (2 samples each = 6 frames)</li>
          <li><strong>Chart Layers:</strong> Candlesticks, VWAP, Bollinger Bands, Volume</li>
          <li><strong>Ground Truth:</strong> Computed deterministically from raw OHLCV data</li>
        </ul>
      </Section>

      {/* Section 4: Setup */}
      <Section title="4. Setup & Architecture">
        <pre>{`007-chart-reader/
├── src/
│   ├── benchmark.ts      # Main CLI entry point
│   ├── chart-reader.ts   # Agent with multimodal prompt
│   ├── output-schema.ts  # Zod schema for predictions
│   ├── ground-truth/     # Compute truth from OHLCV
│   ├── scorers/          # Compare predictions vs truth
│   └── replay-lab/       # Fetch charts & data
├── website/              # This dashboard
│   └── app/api/cron/     # Auto-update every 2h
└── results/              # Per-model JSON outputs`}</pre>

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
        </ol>

        <h4 style={{ marginTop: 24 }}>Run Locally</h4>
        <pre>{`# Clone and install
git clone https://github.com/sanketagarwal/blue-benchmark
cd blue-benchmark/benchmarks/trading/007-chart-reader
pnpm install && pnpm build

# Run benchmark
pnpm benchmark --cheap --quick   # 3 cheap models
pnpm benchmark --expensive       # 3 frontier models`}</pre>
      </Section>

      {/* Section 5: Key Insights */}
      <Section title="5. Key Insights">
        <div style={{ display: 'grid', gap: 16 }}>
          <InsightCard
            title="Cost ≠ Performance (Linearly)"
            description="Gemini 2.5 Flash Lite ($0.38) achieves 48.6% accuracy, while Claude Opus 4.5 ($30) only reaches 55.6%. 80x cost increase yields only ~15% accuracy improvement."
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
              <td>55.6% accuracy (best overall)</td>
            </tr>
            <tr>
              <td>Best Value</td>
              <td>Gemini 2.5 Flash Lite</td>
              <td>48.6% at $0.38/M (best $/accuracy)</td>
            </tr>
            <tr>
              <td>Fastest Response</td>
              <td>Gemini 2.5 Flash Lite</td>
              <td>1.7s average latency</td>
            </tr>
            <tr>
              <td>Balanced</td>
              <td>GPT-4o</td>
              <td>52.8% accuracy, mid-tier cost</td>
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

