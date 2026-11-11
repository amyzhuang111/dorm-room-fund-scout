import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { readSnapshot, manifest, migrate, validateSchema, type Row, type Target } from './corpus-migration';

async function main() {
  const args=process.argv.slice(2);
  const value=(flag:string)=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
  const source=value('--source'),schema=value('--schema'),report=value('--report');
  if (!source || !schema || !report) throw new Error('Required: --source /absolute/scratch.db --schema scout_import_<batch> --report /absolute/report.json [--apply]');
  validateSchema(schema);
  if (!path.isAbsolute(source) || fs.realpathSync(source)===fs.realpathSync('data/campus-universe.db')) throw new Error('Use a separate scratch copy of the current database, with prebuild applied');
  const snapshot=readSnapshot(source);
  let result: object={ ...manifest(snapshot), schema, disposition:'dry_run_only', productionChanged:false };
  if (args.includes('--apply')) {
    const url=process.env.CAMPUS_POSTGRES_MIGRATION_URL;
    if (!url || !/^postgres(?:ql)?:\/\//.test(url)) throw new Error('Set CAMPUS_POSTGRES_MIGRATION_URL to the direct connection for the target database');
    const host=new URL(url).hostname;
    const sql=postgres(url,{ssl:['localhost','127.0.0.1','[::1]'].includes(host)?false:'require',max:1,prepare:false,connect_timeout:15});
    const target:Target={
      query:async(text,values=[])=>await sql.unsafe(text,values) as Row[],
      transaction:async fn=>await sql.begin(async tx=>fn(async(text,values=[])=>await tx.unsafe(text,values) as Row[])) as never,
    };
    try { result={...await migrate(target,snapshot,schema),productionChanged:false}; }
    finally { await sql.end(); }
  }
  fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({schema,tables:snapshot.tables.length,rows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),report,applied:args.includes('--apply'),productionChanged:false}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;});
