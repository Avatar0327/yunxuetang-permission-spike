import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
// Architecture gate requested by Task3: SQL ownership and public-only imports.
test('module repositories cannot read or write foreign private tables', async () => {
  const violations: string[] = [];
  for (const owner of ['authz','organization','training','report','knowledge','account']) {
    let files: string[]; try { files = await readdir(`src/${owner}`); } catch { continue; }
    for (const file of files.filter(f=>f.endsWith('.ts'))) {
      const code = await readFile(`src/${owner}/${file}`, 'utf8');
      for (const match of code.matchAll(/\b(?:from|join|update|into)\s+(authz|organization|training|report|knowledge|account)\.[a-z_]+/gi))
        if (match[1] !== owner) violations.push(`${owner}/${file}: ${match[0]}`);
      for (const match of code.matchAll(/from ['"]\.\.\/(authz|organization|training|report|knowledge|account)\/([^'"]+)['"]/g)) {
        if (match[1]===owner) continue;
        const pureAuthz=['contracts.js','scope.js','policy.js','compiler.js','bulk-candidate.js','revision.js'];
        if (match[2]!=='public.js' && !(match[1]==='authz' && pureAuthz.includes(match[2]!))) violations.push(`${owner}/${file}: private import ${match[0]}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
test('SQL routines retain owning-module table boundaries',async()=>{
 const sql=await readFile('sql/schema.sql','utf8'),violations:string[]=[];
 for(const fn of sql.matchAll(/CREATE OR REPLACE FUNCTION (authz|organization|training|report|knowledge|account)\.([a-z_]+)[\s\S]*?AS \$\$([\s\S]*?)END \$\$/g)){
  for(const table of fn[3]!.matchAll(/\b(?:from|join|update|into)\s+(authz|organization|training|report|knowledge|account)\.[a-z_]+/gi))if(table[1]!==fn[1])violations.push(`${fn[1]}.${fn[2]}: ${table[0]}`);
 }
 assert.deepEqual(violations,[]);
});
