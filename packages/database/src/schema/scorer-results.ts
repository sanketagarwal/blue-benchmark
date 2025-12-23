import { pgTable, uuid, text, real, jsonb, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const scorerResults = pgTable('scorer_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: text('trace_id').notNull(),
  agentId: text('agent_id').notNull(),
  roundNumber: integer('round_number').notNull(),
  scorerId: text('scorer_id').notNull(),
  score: real('score').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('scorer_results_trace_idx').on(table.traceId),
  index('scorer_results_agent_scorer_time_idx').on(table.agentId, table.scorerId, table.createdAt),
]);
