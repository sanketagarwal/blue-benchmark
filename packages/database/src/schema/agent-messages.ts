import { pgTable, uuid, text, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').notNull(),
  role: text('role').notNull(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  outputJson: jsonb('output_json'),
  roundNumber: integer('round_number'),
  traceId: text('trace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
