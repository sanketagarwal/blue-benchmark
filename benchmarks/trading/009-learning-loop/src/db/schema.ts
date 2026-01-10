/**
 * Database Schema for In-Context Learning Experiments
 * 
 * Tracks learning sessions, rounds, and metrics for analysis.
 */

import { pgTable, uuid, text, real, jsonb, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';

/**
 * Learning Sessions - A complete ICL experiment run
 */
export const learningSessions = pgTable('learning_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Session metadata
  sessionId: text('session_id').notNull().unique(),
  modelId: text('model_id').notNull(),
  symbolId: text('symbol_id').notNull(),
  
  // Configuration
  totalRounds: integer('total_rounds').notNull(),
  feedbackType: text('feedback_type').notNull(), // 'detailed', 'simple', 'corrective'
  
  // Aggregate metrics
  baselineAccuracy: real('baseline_accuracy'),
  finalAccuracy: real('final_accuracy'),
  peakAccuracy: real('peak_accuracy'),
  learningGain: real('learning_gain'), // finalAccuracy - baselineAccuracy
  
  // Timestamps
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  // Full results JSON
  config: jsonb('config'),
  summary: jsonb('summary'),
}, (table) => [
  index('learning_sessions_model_idx').on(table.modelId),
  index('learning_sessions_started_idx').on(table.startedAt),
]);

/**
 * Learning Rounds - Individual rounds within a session
 */
export const learningRounds = pgTable('learning_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Session reference
  sessionId: text('session_id').notNull(),
  roundNumber: integer('round_number').notNull(),
  roundType: text('round_type').notNull(), // 'baseline', 'same_chart', 'similar_chart', 'transfer'
  
  // Chart info
  chartUrl: text('chart_url'),
  timeframe: text('timeframe').notNull(),
  chartConditions: jsonb('chart_conditions'), // Pattern conditions for similar chart matching
  
  // Model performance
  accuracy: real('accuracy').notNull(),
  exactMatches: integer('exact_matches').notNull(),
  totalFields: integer('total_fields').notNull(),
  
  // Per-field results
  fieldResults: jsonb('field_results').notNull(),
  
  // Feedback provided (if any)
  feedbackProvided: text('feedback_provided'),
  
  // Timing
  latencyMs: integer('latency_ms'),
  tokensUsed: integer('tokens_used'),
  
  // Langfuse trace
  langfuseTraceId: text('langfuse_trace_id'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('learning_rounds_session_idx').on(table.sessionId),
  index('learning_rounds_type_idx').on(table.roundType),
]);

/**
 * Similar Charts - Precomputed chart pairs with matching conditions
 */
export const similarCharts = pgTable('similar_charts', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Chart identification
  symbolId: text('symbol_id').notNull(),
  timeframe: text('timeframe').notNull(),
  chartTime: timestamp('chart_time', { withTimezone: true }).notNull(),
  chartUrl: text('chart_url'),
  
  // Ground truth values (for matching)
  uptrendPullbackToVwap: boolean('uptrend_pullback_to_vwap').notNull(),
  volatilityDirectionCombo: text('volatility_direction_combo').notNull(),
  testedAndHeldSupport: boolean('tested_and_held_support').notNull(),
  breakoutWithVolume: boolean('breakout_with_volume').notNull(),
  potentialReversalAtSupport: boolean('potential_reversal_at_support').notNull(),
  overallBias: text('overall_bias').notNull(),
  
  // Raw data for reference
  groundTruth: jsonb('ground_truth').notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('similar_charts_symbol_tf_idx').on(table.symbolId, table.timeframe),
  index('similar_charts_conditions_idx').on(
    table.uptrendPullbackToVwap, 
    table.volatilityDirectionCombo, 
    table.overallBias
  ),
]);

/**
 * Learning Curves - Aggregated learning progression data
 */
export const learningCurves = pgTable('learning_curves', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Aggregation key
  modelId: text('model_id').notNull(),
  roundNumber: integer('round_number').notNull(),
  roundType: text('round_type').notNull(),
  
  // Aggregated metrics (across all sessions)
  sampleCount: integer('sample_count').notNull(),
  avgAccuracy: real('avg_accuracy').notNull(),
  stdAccuracy: real('std_accuracy'),
  minAccuracy: real('min_accuracy'),
  maxAccuracy: real('max_accuracy'),
  
  // Per-field averages
  fieldAccuracies: jsonb('field_accuracies'),
  
  // Computed deltas
  avgDeltaFromBaseline: real('avg_delta_from_baseline'),
  
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('learning_curves_model_round_idx').on(table.modelId, table.roundNumber),
]);

// Type exports
export type LearningSession = typeof learningSessions.$inferSelect;
export type NewLearningSession = typeof learningSessions.$inferInsert;
export type LearningRound = typeof learningRounds.$inferSelect;
export type NewLearningRound = typeof learningRounds.$inferInsert;
export type SimilarChart = typeof similarCharts.$inferSelect;
export type NewSimilarChart = typeof similarCharts.$inferInsert;
