import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

export type Cell = string | number | bigint | null;
export type Row = Record<string, Cell>;
type Column = { name: string; type: string; pk: number };
type ForeignKey = { id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string };
export type Table = { name: string; sql: string; columns: Column[]; keys: ForeignKey[]; rows: Row[]; digest: string };
export type Snapshot = { tables: Table[]; indexes: { name: string; sql: string }[]; digest: string };
export type Query = (sql: string, values?: (string | number | null)[]) => Promise<Row[]>;
export interface Target { query: Query; transaction<T>(fn: (query: Query) => Promise<T>): Promise<T> }

export function ident(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsupported SQL identifier: ${value}`);
  return `"${value}"`;
}
export function validateSchema(schema: string): string {
  if (!/^scout_import_[a-z0-9_]{1,40}$/.test(schema)) throw new Error('Use a new scout_import_<batch> schema; public and active schemas are protected');
  return ident(schema);
}
function canonical(value: Cell, type: string): string | number | null {
  if (value === null) return null;
  if (/INT/i.test(type)) return BigInt(value).toString();
  if (/REAL|FLOAT|DOUBLE/i.test(type)) return Number(value);
  return String(value);
}
export function tableDigest(columns: Column[], rows: Row[]): string {
  // Sort row hashes, not database collation order. Duplicate rows still count.
  const hashes = rows.map(row => createHash('sha256').update(JSON.stringify(columns.map(c => canonical(row[c.name], c.type)))).digest('hex')).sort();
  return createHash('sha256').update(JSON.stringify(columns)).update(hashes.join('\n')).digest('hex');
}
export function readSnapshot(file: string): Snapshot {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  db.defaultSafeIntegers(true);
  try {
    return db.transaction(() => {
      const check = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
      if (check.length !== 1 || check[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Source has unresolved foreign-key references; review before migration');
      const objects = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name").all() as { type: string; name: string; sql: string }[];
      if (objects.some(o => !['table', 'index'].includes(o.type))) throw new Error('Views or triggers require an explicit migration');
      const tables = objects.filter(o => o.type === 'table').map(o => {
        const columns = (db.prepare(`PRAGMA table_info(${ident(o.name)})`).all() as (Column & { pk: bigint })[]).map(c => ({ name: c.name, type: c.type, pk: Number(c.pk) }));
        if (columns.some(c => !/^(TEXT|INTEGER|REAL)$/i.test(c.type))) throw new Error(`Unsupported column type in ${o.name}`);
        const keys = (db.prepare(`PRAGMA foreign_key_list(${ident(o.name)})`).all() as ForeignKey[]).map(k => ({...k, id:Number(k.id),seq:Number(k.seq)}));
        const rows = db.prepare(`SELECT * FROM ${ident(o.name)}`).all() as Row[];
        return { name: o.name, sql: o.sql, columns, keys, rows, digest: tableDigest(columns, rows) };
      });
      const indexes = objects.filter(o => o.type === 'index').map(({name,sql}) => ({name,sql}));
      const digest = createHash('sha256').update(JSON.stringify(tables.map(t => [t.name,t.sql,t.digest]))).update(JSON.stringify(indexes)).digest('hex');
      return { tables, indexes, digest };
    })();
  } finally { db.close(); }
}

/** Translate only the source dialect we support; keep CHECK/UNIQUE/default semantics. */
export function tableDdl(table: Table, schema: string): string {
  const namespace = validateSchema(schema);
  if (/AUTOINCREMENT|WITHOUT ROWID|GENERATED|\bFOREIGN KEY\b/i.test(table.sql)) throw new Error(`Review nonstandard DDL in ${table.name}`);
  let ddl = table.sql.replace(/--[^\n]*/g, '').replace(/^CREATE TABLE\s+(?:"?\w+"?)\s*\(/i, `CREATE TABLE ${namespace}.${ident(table.name)} (`);
  ddl = ddl.replace(/\(datetime\('now'\)\)/gi, "(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))");
  // Deferring creation of foreign keys handles the claims/snapshots/evidence cycles.
  ddl = ddl.replace(/\s+REFERENCES\s+\w+\s*\(\w+\)(?:\s+ON (?:DELETE|UPDATE) (?:CASCADE|RESTRICT|SET NULL|SET DEFAULT|NO ACTION))*/gi, '');
  // Leave string literals untouched (including enum CHECK values and defaults).
  ddl = ddl.split(/('(?:''|[^'])*')/g).map((part, i) => i % 2 ? part : part.replace(/\bINTEGER\b/gi, 'BIGINT').replace(/\bREAL\b/gi, 'DOUBLE PRECISION')).join('');
  const nullableKey = table.columns.filter(c => c.pk && table.rows.some(row => row[c.name] === null));
  if (nullableKey.length) {
    if (table.columns.filter(c => c.pk).length !== 1 || table.columns.some(c => c.name === '_scout_row_id')) throw new Error(`Review nullable composite primary key in ${table.name}`);
    // SQLite permits NULL text primary keys. Preserve those historical values;
    // give Postgres a separate internal key instead of fabricating source IDs.
    ddl = ddl.replace(/\bPRIMARY KEY\b/i, 'UNIQUE').replace(/\)\s*$/, ', _scout_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY)');
  }
  return ddl;
}
export function indexDdl(sql: string, schema: string): string {
  const ns=validateSchema(schema);
  if (!/^CREATE (?:UNIQUE )?INDEX\s+\w+\s+ON\s+\w+\s*\(/i.test(sql)) throw new Error('Unsupported index definition');
  return sql.replace(/\bON\s+(\w+)\s*\(/i, (_,table) => `ON ${ns}.${ident(table)} (`).replace(/\bIFNULL\(/gi,'COALESCE(');
}
export function manifest(snapshot: Snapshot) {
  return { format: 1, digest: snapshot.digest, tables: snapshot.tables.map(t => ({ name:t.name, rows:t.rows.length, sha256:t.digest })), indexes:snapshot.indexes.length, preservedNullableKeys:snapshot.tables.flatMap(t=>{const keys=t.columns.filter(c=>c.pk);const rows=t.rows.filter(r=>keys.some(k=>r[k.name]===null)).length;return rows?[{table:t.name,rows,internalKey:'_scout_row_id'}]:[]}), foreignKeys:snapshot.tables.reduce((n,t)=>n+new Set(t.keys.map(k=>k.id)).size,0) };
}
async function verify(query: Query, snapshot: Snapshot, ns: string) {
  for (const table of snapshot.tables) {
    const rows = await query(`SELECT * FROM ${ns}.${ident(table.name)}`);
    if (rows.length !== table.rows.length || tableDigest(table.columns,rows) !== table.digest) throw new Error(`Verification failed: ${table.name}`);
  }
}
export async function migrate(target: Target, snapshot: Snapshot, schema: string) {
  const ns=validateSchema(schema);
  return target.transaction(async query => {
    // Concurrent attempts serialize; rollback includes DDL and all inserted rows.
    await query('SELECT pg_advisory_xact_lock(164831, 1)');
    const existing=await query('SELECT schema_name FROM information_schema.schemata WHERE schema_name=$1',[schema]);
    if (existing.length) {
      const marker=await query(`SELECT digest FROM ${ns}._migration_manifest`);
      if (marker.length!==1 || marker[0].digest!==snapshot.digest) throw new Error('Existing schema belongs to another snapshot; use a new schema');
      await verify(query,snapshot,ns);
      return { ...manifest(snapshot), schema, disposition:'verified_existing' };
    }
    await query(`CREATE SCHEMA ${ns}`);
    // Private raw evidence must never be automatically exposed through public APIs.
    await query(`REVOKE ALL ON SCHEMA ${ns} FROM PUBLIC`);
    for (const table of snapshot.tables) await query(tableDdl(table,schema));
    for (const table of snapshot.tables) {
      const width=table.columns.length;
      const batchSize=Math.min(250,Math.floor(30000/width));
      for (let start=0;start<table.rows.length;start+=batchSize) {
        const batch=table.rows.slice(start,start+batchSize);
        const params=batch.flatMap(row=>table.columns.map(c=>canonical(row[c.name],c.type)));
        const values=batch.map((_,i)=>`(${table.columns.map((_,j)=>`$${i*width+j+1}`).join(',')})`).join(',');
        await query(`INSERT INTO ${ns}.${ident(table.name)} (${table.columns.map(c=>ident(c.name)).join(',')}) VALUES ${values}`,params);
      }
    }
    for (const table of snapshot.tables) {
      for (const id of new Set(table.keys.map(k=>k.id))) {
        const keys=table.keys.filter(k=>k.id===id).sort((a,b)=>a.seq-b.seq), key=keys[0];
        const actions=[key.on_update,key.on_delete];
        if (actions.some(a=>!['CASCADE','RESTRICT','SET NULL','SET DEFAULT','NO ACTION'].includes(a))) throw new Error('Unsupported FK action');
        await query(`ALTER TABLE ${ns}.${ident(table.name)} ADD CONSTRAINT ${ident(`fk_${table.name}_${id}`)} FOREIGN KEY (${keys.map(k=>ident(k.from)).join(',')}) REFERENCES ${ns}.${ident(key.table)} (${keys.map(k=>ident(k.to)).join(',')}) ON UPDATE ${key.on_update} ON DELETE ${key.on_delete} DEFERRABLE INITIALLY DEFERRED`);
      }
    }
    for (const index of snapshot.indexes) await query(indexDdl(index.sql,schema));
    await verify(query,snapshot,ns);
    await query(`CREATE TABLE ${ns}._migration_manifest (digest text PRIMARY KEY, manifest jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now())`);
    await query(`INSERT INTO ${ns}._migration_manifest (digest,manifest) VALUES ($1,$2::jsonb)`,[snapshot.digest,JSON.stringify(manifest(snapshot))]);
    return { ...manifest(snapshot), schema, disposition:'imported_and_verified' };
  });
}
