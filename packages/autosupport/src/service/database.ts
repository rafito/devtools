import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createDrizzleRepositories } from '../persistence/drizzle.js'
import { createSupportSchema } from '../schema/index.js'

type SqlExecutor = {
  unsafe(query: string): Promise<unknown>
}

const SERVICE_SCHEMA_SQL = `
DO $$
BEGIN
  CREATE TYPE support_ticket_status AS ENUM (
    'open',
    'investigating',
    'fixing',
    'pr_review',
    'resolved'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE support_ticket_source AS ENUM ('chat', 'sentry');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  conversation_id uuid,
  description text NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  source support_ticket_source NOT NULL DEFAULT 'chat',
  sentry_issue_id text,
  github_issue_id integer,
  github_pr_id integer,
  resolved_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_github_issue_idx
  ON support_tickets (github_issue_id);
CREATE INDEX IF NOT EXISTS support_tickets_github_pr_idx
  ON support_tickets (github_pr_id);
CREATE INDEX IF NOT EXISTS support_tickets_sentry_issue_idx
  ON support_tickets (sentry_issue_id);
CREATE INDEX IF NOT EXISTS support_tickets_user_notification_idx
  ON support_tickets (user_id, notified_at)
  WHERE resolved_at IS NOT NULL;
`

export async function bootstrapServiceSchema(sql: SqlExecutor): Promise<void> {
  await sql.unsafe(SERVICE_SCHEMA_SQL)
}

export async function createServiceDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 })
  await bootstrapServiceSchema(client)
  const schema = createSupportSchema()
  const db = drizzle(client)
  const repositories = createDrizzleRepositories(db, schema)

  return {
    client,
    db,
    schema,
    repositories,
    close: () => client.end(),
  }
}

export type ServiceDatabase = Awaited<ReturnType<typeof createServiceDatabase>>
