import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isSingleClass,
  generateBenchmarkOverview,
  generateMethodology,
  generateTaskSpecSection,
  generateValidityGateSection,
  generateExtensionPlanSection,
  generateEnsembleSection,
  HORIZONS,
  calculateMean,
  formatNumber,
  formatPrevalenceLogLoss,
  checkLabelImbalance,
  SECTION_DATASET_DIAGNOSTICS,
  SECTION_PREDICTION_DIVERSITY,
  NO_DATA_COLLECTED,
  DATASET_DIAGNOSTICS_TABLE_HEADER,
  DATASET_DIAGNOSTICS_TABLE_SEPARATOR,
  type ModelState,
  type BenchmarkDiagnostics,
  type LabelByTimestamp,
} from './persist-results.js';
import {
  generateScoringMethodology,
  generateGroundTruthMethodology,
} from './verbose-documentation.js';

import type { DatasetDiagnostics } from './diagnostics/dataset-diagnostics.js';
import type { ModelParseDiagnostics } from './diagnostics/parse-diagnostics.js';
import type { ModelPredictionDiversity } from './diagnostics/prediction-diagnostics.js';
import type { EnsemblePerformance } from './ensemble/online-ensemble.js';
import type { ExtensionPlan } from './extension/extension-trigger.js';
import type { RunInvariants } from './run-invariants.js';
import type { ModelValidityResult } from './scorers/validity-gates.js';
import type { TimeframeId } from './timeframe-config.js';

const QUICK_RESULTS_FILE = 'BENCHMARK_RESULTS_QUICK.md';
const QUICK_RUN_INTERPRETATION_HEADER = '**Quick-run interpretation:**';
const QUICK_RUN_ROUNDS_NOTE = '- With N=3 rounds per horizon, treat rankings as indicative only.';

/**
 * Ensemble baseline data for quick mode preview
 */
export interface QuickEnsembleBaselines {
  prevalenceLL: number;
  /** Best single model among eligible (valid + adequate coverage) */
  bestEligibleSingleLL: number;
  /** Best single model overall (oracle/diagnostic) */
  bestOverallSingleLL: number;
  equalWeightLL: number;
}

/**
 * Top contributor data for quick mode preview
 */
export interface QuickTopContributor {
  modelId: string;
  avgWeight: number;
}

/**
 * Ensemble data bundle for a single mode (strict or wide)
 */
export interface EnsembleDataBundle {
  byHorizon: Record<TimeframeId, EnsemblePerformance>;
  baselines: Record<TimeframeId, QuickEnsembleBaselines>;
  topContributors: Record<TimeframeId, QuickTopContributor[]>;
  /** Average weight entropy across horizons (high = near uniform) */
  avgWeightEntropy: number;
}

/**
 * Quick mode metadata for quick report
 */
export interface QuickRunMetadata {
  startTime: string;
  symbolId: string;
  totalRounds: number;
  modelCount: number;
  diagnostics?: BenchmarkDiagnostics;
  validityResults?: ModelValidityResult[];
  extensionPlan?: ExtensionPlan;
  /** Strict ensemble: only valid models */
  strictEnsemble?: EnsembleDataBundle;
  /** Wide ensemble: all models (diagnostic) */
  wideEnsemble?: EnsembleDataBundle;
  /** @deprecated Use strictEnsemble/wideEnsemble instead */
  ensembleByHorizon?: Record<TimeframeId, EnsemblePerformance>;
  /** @deprecated Use strictEnsemble/wideEnsemble instead */
  ensembleBaselinesByHorizon?: Record<TimeframeId, QuickEnsembleBaselines>;
  /** @deprecated Use strictEnsemble/wideEnsemble instead */
  ensembleTopContributorsByHorizon?: Record<TimeframeId, QuickTopContributor[]>;
  invariants?: RunInvariants;
}

/**
 * Quick mode model metrics for results table
 */
interface QuickModelMetrics {
  modelId: string;
  logLoss15m: number;
  logLoss1h: number;
  logLoss4h: number;
  logLoss24h: number;
  meanLogLoss: number;
  failedRounds: number;
  totalRounds: number;
}

/**
 * Calculate quick mode metrics for a model
 * @param model - Model state
 * @param totalRounds - Total rounds in benchmark
 * @returns Quick model metrics
 */
function calculateQuickModelMetrics(
  model: ModelState,
  totalRounds: number
): QuickModelMetrics {
  const logLoss15m = calculateMean(model.logLossByHorizon['15m']);
  const logLoss1h = calculateMean(model.logLossByHorizon['1h']);
  const logLoss4h = calculateMean(model.logLossByHorizon['4h']);
  const logLoss24h = calculateMean(model.logLossByHorizon['24h']);

  const horizonMeans = [logLoss15m, logLoss1h, logLoss4h, logLoss24h].filter(v => v > 0);
  const meanLogLoss = horizonMeans.length > 0 ? calculateMean(horizonMeans) : 0;

  const failedRounds = model.failedRounds?.length ?? 0;

  return {
    modelId: model.modelId,
    logLoss15m,
    logLoss1h,
    logLoss4h,
    logLoss24h,
    meanLogLoss,
    failedRounds,
    totalRounds,
  };
}

/**
 * Format log loss value for table display
 * @param value - Log loss value
 * @returns Formatted string or '-' if no data
 */
function formatLogLossCell(value: number): string {
  return value > 0 ? formatNumber(value, 3) : '-';
}

/**
 * Generate dataset diagnostics section for quick mode report
 * @param diagnostics - Dataset diagnostics or undefined
 * @returns Array of markdown lines
 */
export function generateQuickDatasetDiagnosticsSection(diagnostics: DatasetDiagnostics | undefined): string[] {
  const lines: string[] = [SECTION_DATASET_DIAGNOSTICS, ''];

  if (diagnostics === undefined) {
    lines.push(NO_DATA_COLLECTED, '');
    return lines;
  }

  lines.push(DATASET_DIAGNOSTICS_TABLE_HEADER, DATASET_DIAGNOSTICS_TABLE_SEPARATOR);
  const warnings: string[] = [];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const d = diagnostics.byHorizon[horizon];
    const { n, countTrue, countFalse, pTrue } = d.labels;

    const MINUS_LOG_EPSILON = 34.5388;
    const extremeTrueLL = n > 0 ? (countFalse * MINUS_LOG_EPSILON) / n : 0;
    const extremeFalseLL = n > 0 ? (countTrue * MINUS_LOG_EPSILON) / n : 0;

    const row = [
      horizon,
      String(n),
      String(countTrue),
      String(countFalse),
      pTrue.toFixed(3),
      d.baselines.randomLogLoss.toFixed(3),
      formatPrevalenceLogLoss(d.baselines.prevalenceLogLoss),
      extremeTrueLL.toFixed(3),
      extremeFalseLL.toFixed(3),
    ];
    lines.push(`| ${row.join(' | ')} |`);

    const warning = checkLabelImbalance(horizon, d.labels);
    if (warning !== undefined) {
      warnings.push(warning);
    }
  }

  lines.push('', `*Unique prediction timestamps: ${String(diagnostics.totalRounds)}*`);
  lines.push('*Clipping: ε = 1e-15 (probabilities clipped to [ε, 1-ε] to avoid log(0))*', '');

  for (const w of warnings) {
    lines.push(w);
  }
  if (warnings.length > 0) {
    lines.push('');
  }

  return lines;
}

/**
 * Generate label balance gate summary
 * @param diagnostics - Benchmark diagnostics or undefined
 * @returns Array of markdown lines
 */
export function generateLabelBalanceGate(diagnostics: BenchmarkDiagnostics | undefined): string[] {
  if (diagnostics?.dataset?.byHorizon === undefined) {
    return [];
  }

  const unbalanced = HORIZONS.filter(h => {
    // eslint-disable-next-line security/detect-object-injection -- h from typed constant array
    const d = diagnostics.dataset?.byHorizon[h];
    return d !== undefined && (d.labels.countTrue === 0 || d.labels.countFalse === 0);
  });

  if (unbalanced.length === 0) {
    return ['**Label Balance Gate:** ✅ PASSED — All horizons have ≥1 example of each class.', ''];
  }

  return [`**Label Balance Gate:** ⚠️ INFORMATIONAL ONLY — ${unbalanced.join(', ')} have < 1 negative example each.`, ''];
}

/**
 * Generate prediction diversity section for quick mode report
 * @param diversities - Array of model prediction diversity metrics or undefined
 * @returns Array of markdown lines
 */
export function generateQuickPredictionDiversitySection(diversities: ModelPredictionDiversity[] | undefined): string[] {
  const lines: string[] = [
    SECTION_PREDICTION_DIVERSITY,
    '',
    '*Stats are computed only on successful predictions (failed rounds excluded).*',
    '',
  ];

  if (diversities === undefined || diversities.length === 0) {
    lines.push(NO_DATA_COLLECTED);
    lines.push('');
    return lines;
  }

  for (const model of diversities) {
    lines.push(`### ${model.modelId}`);
    lines.push('');
    lines.push('| Horizon | Unique P | Min | Max | Std Dev |');
    lines.push('|---------|----------|-----|-----|---------|');

    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
      const d = model.byHorizon[horizon];
      lines.push(`| ${horizon} | ${String(d.uniquePCount)} | ${d.pMin.toFixed(3)} | ${d.pMax.toFixed(3)} | ${d.pStdDev.toFixed(3)} |`);
    }

    lines.push('');
  }

  return lines;
}

/**
 * Generate models tested section for quick report
 * @param models - Map of model states
 * @returns Array of markdown lines
 */
export function generateQuickModelsList(models: Map<string, ModelState>): string[] {
  const modelIds = [...models.keys()].sort();
  const lines: string[] = [
    '## Models Tested',
    '',
  ];

  for (const modelId of modelIds) {
    lines.push(`- ${modelId}`);
  }

  lines.push('');
  return lines;
}

/**
 * Generate scored models summary for quick report
 * @param models - Map of model states
 * @param totalRounds - Total rounds in benchmark
 * @returns Array of markdown lines
 */
export function generateScoredModelsSummary(
  models: Map<string, ModelState>,
  totalRounds: number
): string[] {
  const allModels = [...models.values()];
  const scoredModels = allModels.filter(m => m.roundScores.length > 0);
  const totalPredictions = scoredModels.reduce(
    (sum, m) => sum + m.roundScores.length * 4,
    0
  );

  return [
    `**Scored models:** ${String(scoredModels.length)}/${String(allModels.length)}`,
    `**Total scored predictions:** ${String(totalPredictions)} (${String(scoredModels.length)} models × ${String(totalRounds)} rounds × 4 horizons)`,
    '',
  ];
}

/**
 * Generate Label by Timestamp section for quick mode report
 * Shows per-timestamp label matrix for window alignment verification
 * @param labelsByTimestamp - Array of label records per timestamp or undefined
 * @returns Array of markdown lines
 */
export function generateLabelByTimestampSection(
  labelsByTimestamp: LabelByTimestamp[] | undefined
): string[] {
  if (labelsByTimestamp === undefined || labelsByTimestamp.length === 0) {
    return [];
  }

  const lines: string[] = [
    '## Label by Timestamp',
    '',
    '| Timestamp | 15m | 1h | 4h | 24h |',
    '|-----------|-----|----|----|-----|',
  ];

  const sorted = [...labelsByTimestamp].sort(
    (a, b) => b.snapTime.getTime() - a.snapTime.getTime()
  );

  for (const record of sorted) {
    const ts = record.snapTime.toISOString();
    const l15m = String(record.labels['15m']);
    const l1h = String(record.labels['1h']);
    const l4h = String(record.labels['4h']);
    const l24h = String(record.labels['24h']);
    lines.push(`| ${ts} | ${l15m} | ${l1h} | ${l4h} | ${l24h} |`);
  }

  lines.push('');
  lines.push('*Labels: 1 = noNewLow (bottom held), 0 = new low made*');
  lines.push('');

  return lines;
}

/**
 * Generate single-class warning for quick mode
 * @param diagnostics - Dataset diagnostics
 * @returns Array of markdown lines (empty if not single-class)
 */
export function generateSingleClassWarning(diagnostics: DatasetDiagnostics | undefined): string[] {
  if (!isSingleClass(diagnostics)) {
    return [];
  }

  if (diagnostics?.byHorizon === undefined) {
    return [];
  }

  const firstHorizon = Object.values(diagnostics.byHorizon)[0];
  const pTrue = firstHorizon?.labels.pTrue ?? 1;
  const isPositive = pTrue === 1;

  return [
    `> ⚠️ **Single-class sample**: All horizons have 100% ${isPositive ? 'positive' : 'negative'} labels in this run. Model rankings reflect calibration on the dominant class only. Comparisons are not meaningful for assessing prediction skill on ${isPositive ? 'negative' : 'positive'} cases.`,
    '',
    QUICK_RUN_INTERPRETATION_HEADER,
    QUICK_RUN_ROUNDS_NOTE,
    `- **This run has all labels = ${isPositive ? '1' : '0'} (${isPositive ? 'noNewLow=true' : 'noNewLow=false'}).** Model rankings only show calibration quality, not ability to detect ${isPositive ? 'new lows' : 'no-new-low cases'}.`,
    '- Models with LL < 0.693 beat random; models with LL → 0 approach optimal constant predictor.',
    '',
  ];
}

/**
 * Generate interpretation note for quick mode (when not single-class)
 * @returns Array of markdown lines
 */
export function generateQuickInterpretationNote(): string[] {
  return [
    QUICK_RUN_INTERPRETATION_HEADER,
    QUICK_RUN_ROUNDS_NOTE,
    '- Models with LL < 0.693 beat random baseline; models with LL → 0 approach optimal.',
    '',
  ];
}

/**
 * Generate extension and ensemble preview section for quick mode
 * Shows what extension/ensemble decisions would be made based on quick mode data
 * @param meta - Quick run metadata with optional extension/ensemble data
 * @returns Array of markdown lines
 */
export function generateExtensionEnsemblePreview(meta: QuickRunMetadata): string[] {
  const hasValidity = meta.validityResults !== undefined && meta.validityResults.length > 0;
  const hasExtension = meta.extensionPlan !== undefined;
  const hasEnsemble = meta.strictEnsemble !== undefined && meta.wideEnsemble !== undefined;

  if (!hasValidity && !hasExtension && !hasEnsemble) {
    return [];
  }

  const lines: string[] = [
    '## Extension & Ensemble Preview',
    '',
    '*Quick mode (N=3) runs the full pipeline to verify functionality. Results below are for validation only.*',
    '',
  ];

  if (hasValidity && meta.validityResults !== undefined) {
    lines.push(...generateValidityGateSection(meta.validityResults));
  }

  if (hasExtension && meta.extensionPlan !== undefined) {
    lines.push(...generateExtensionPlanSection(meta.extensionPlan, meta.totalRounds));
  }

  if (hasEnsemble &&
      meta.strictEnsemble !== undefined &&
      meta.wideEnsemble !== undefined) {
    lines.push(...generateEnsembleSection(
      meta.strictEnsemble,
      meta.wideEnsemble
    ));
    lines.push('');
  }

  return lines;
}

interface FailuresByType {
  transport: number;
  timeout: number;
  parse: number;
  schema: number;
  other: number;
}

function extractFailuresByType(parseDiag: ModelParseDiagnostics): FailuresByType | undefined {
  return parseDiag.failuresByType;
}

function buildFailureTypeParts(byType: FailuresByType): string[] {
  const parts: string[] = [];
  if (byType.transport > 0) {
    parts.push(`transport: ${String(byType.transport)}`);
  }
  if (byType.timeout > 0) {
    parts.push(`timeout: ${String(byType.timeout)}`);
  }
  if (byType.parse > 0) {
    parts.push(`parse: ${String(byType.parse)}`);
  }
  if (byType.schema > 0) {
    parts.push(`schema: ${String(byType.schema)}`);
  }
  if (byType.other > 0) {
    parts.push(`other: ${String(byType.other)}`);
  }
  return parts;
}

/**
 * Generate invariants section for quick mode report
 * @param invariants - Run invariants
 * @returns Array of markdown lines
 */
function generateQuickInvariantsSection(invariants: RunInvariants): string[] {
  const lines: string[] = [
    '## Run Invariants',
    '',
    '*Single source of truth for this run.*',
    '',
    '### Horizons',
    '',
    '| Horizon | Labels | pTrue | Rankable | Reason |',
    '|---------|--------|-------|----------|--------|',
  ];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const h = invariants.byHorizon[horizon];
    const rankable = h.isRankable ? '✅' : '❌';
    const reason = h.rankabilityReason ?? '-';
    lines.push(`| ${horizon} | ${String(h.labelCount)} | ${h.pTrue.toFixed(2)} | ${rankable} | ${reason} |`);
  }

  lines.push('');
  lines.push(`**Model sets:** ${String(invariants.sets.evaluated.length)} evaluated → ${String(invariants.sets.valid.length)} valid → ${String(invariants.sets.qualified.length)} qualified`);
  lines.push('');

  return lines;
}

/**
 * Format failure type breakdown for display
 * @param parseDiag - Parse diagnostics for a model or undefined
 * @returns Formatted string like "(parse: 2, schema: 1)" or empty string
 */
function formatFailureTypeBreakdown(parseDiag: ModelParseDiagnostics | undefined): string {
  if (parseDiag === undefined) {
    return '';
  }

  const hasFailures = parseDiag.parseFailCount > 0 || parseDiag.schemaFailCount > 0;
  if (!hasFailures) {
    return '';
  }

  const byType = extractFailuresByType(parseDiag);
  if (byType === undefined) {
    return '';
  }

  const parts = buildFailureTypeParts(byType);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * Generate results summary table for quick report
 * @param models - Map of model states
 * @param totalRounds - Total rounds in benchmark
 * @param diagnostics - Optional benchmark diagnostics for failure type breakdown
 * @returns Array of markdown lines
 */
export function generateQuickResultsTable(
  models: Map<string, ModelState>,
  totalRounds: number,
  diagnostics?: BenchmarkDiagnostics
): string[] {
  const allModels = [...models.values()];
  const metrics = allModels
    .map(m => calculateQuickModelMetrics(m, totalRounds))
    .sort((a, b) => {
      if (a.failedRounds === a.totalRounds && b.failedRounds !== b.totalRounds) {
        return 1;
      }
      if (b.failedRounds === b.totalRounds && a.failedRounds !== a.totalRounds) {
        return -1;
      }
      return a.meanLogLoss - b.meanLogLoss;
    });

  const parseDiagByModel = new Map<string, ModelParseDiagnostics>();
  if (diagnostics?.parseDiagnostics !== undefined) {
    for (const d of diagnostics.parseDiagnostics) {
      parseDiagByModel.set(d.modelId, d);
    }
  }

  const lines: string[] = [
    '## Results Summary',
    '',
    ...generateScoredModelsSummary(models, totalRounds),
    '| Model | 15m LL | 1h LL | 4h LL | 24h LL | Mean LL | Failed Rounds |',
    '|-------|--------|-------|-------|--------|---------|---------------|',
  ];

  for (const m of metrics) {
    const parseDiag = parseDiagByModel.get(m.modelId);
    const failureBreakdown = formatFailureTypeBreakdown(parseDiag);
    const allRoundsFailed = m.failedRounds === m.totalRounds;
    const row = allRoundsFailed
      ? [m.modelId, '-', '-', '-', '-', '-', `${String(m.failedRounds)}/${String(m.totalRounds)} failed${failureBreakdown}`]
      : [
          m.modelId,
          formatLogLossCell(m.logLoss15m),
          formatLogLossCell(m.logLoss1h),
          formatLogLossCell(m.logLoss4h),
          formatLogLossCell(m.logLoss24h),
          formatLogLossCell(m.meanLogLoss),
          m.failedRounds > 0 ? `${String(m.failedRounds)}${failureBreakdown}` : String(m.failedRounds),
        ];
    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');
  lines.push('*Failed rounds are excluded from scoring. Each round produces 4 horizon predictions.*');
  lines.push('');
  return lines;
}

/**
 * Generate markdown content for quick mode verification report
 * Includes full methodology documentation with actual model data
 * @param models - Map of model states
 * @param meta - Quick mode run metadata
 * @returns Markdown string
 */
export function generateQuickMarkdown(
  models: Map<string, ModelState>,
  meta: QuickRunMetadata
): string {
  const lines: string[] = [
    '# agent_006 Benchmark Results (QUICK MODE)',
    '',
    '> **This is a quick mode verification run - not a full benchmark.**',
    '',
    `**Symbol:** ${meta.symbolId}`,
    `**Generated:** ${new Date().toISOString()}`,
    `**Rounds:** ${String(meta.totalRounds)}`,
    `**Models Tested:** ${String(meta.modelCount)}`,
    '',
    '---',
    '',
  ];

  lines.push(...generateBenchmarkOverview());
  lines.push(...generateMethodology());
  lines.push(...generateTaskSpecSection());

  lines.push('## Scoring Methodology');
  lines.push('');
  lines.push(generateScoringMethodology());
  lines.push('');

  lines.push('## Ground Truth Methodology');
  lines.push('');
  lines.push(generateGroundTruthMethodology());
  lines.push('');

  lines.push(...generateQuickModelsList(models));
  lines.push(...generateQuickResultsTable(models, meta.totalRounds, meta.diagnostics));

  const singleClassWarning = generateSingleClassWarning(meta.diagnostics?.dataset);
  if (singleClassWarning.length > 0) {
    lines.push(...singleClassWarning);
  } else {
    lines.push(...generateQuickInterpretationNote());
  }

  if (meta.invariants !== undefined) {
    lines.push(...generateQuickInvariantsSection(meta.invariants));
  }

  lines.push(...generateQuickDatasetDiagnosticsSection(meta.diagnostics?.dataset));

  lines.push(...generateLabelBalanceGate(meta.diagnostics));

  lines.push(...generateLabelByTimestampSection(meta.diagnostics?.labelsByTimestamp));

  lines.push(...generateQuickPredictionDiversitySection(meta.diagnostics?.predictionDiversity));

  lines.push(...generateExtensionEnsemblePreview(meta));

  lines.push('---');
  lines.push('*Quick mode verification - auto-generated by agent_006 benchmark*');

  return lines.join('\n');
}

/**
 * Persist quick mode verification results to markdown file
 * @param models - Map of model states
 * @param meta - Quick mode run metadata
 */
export function persistQuickResults(
  models: Map<string, ModelState>,
  meta: QuickRunMetadata
): void {
  const markdown = generateQuickMarkdown(models, meta);
  const filePath = join(process.cwd(), QUICK_RESULTS_FILE);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from constants
  writeFileSync(filePath, markdown, 'utf8');
}
