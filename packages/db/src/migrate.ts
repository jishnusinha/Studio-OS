import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://studio:studio@localhost:5432/studioos';

async function main() {
  const client = postgres(connectionString, { max: 1 });
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.join(__dirname, '..', 'drizzle');

  await client`
    CREATE TABLE IF NOT EXISTS studioos_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const [applied] = await client`
      SELECT id FROM studioos_migrations WHERE id = ${file}
    `;
    if (applied) {
      console.log('skip', file);
      continue;
    }
    const sql = readFileSync(path.join(migrationsFolder, file), 'utf8');
    console.log('applying', file);
    await client.unsafe(sql);
    await client`INSERT INTO studioos_migrations (id) VALUES (${file})`;
  }

  console.log('Migrations complete');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
