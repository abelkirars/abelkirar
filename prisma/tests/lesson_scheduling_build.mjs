// Production-style build in a credential-free disposable source copy.
// Deliberately excludes all env/certificate/backup files; never loads dotenv here.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),reuse=process.argv[2];
const dir=reuse?realpathSync(reuse):mkdtempSync(path.join(tmpdir(),'academy-schedule-build-'));
assert.equal(path.dirname(dir).toLowerCase(),realpathSync(tmpdir()).toLowerCase());
assert(path.basename(dir).startsWith('academy-schedule-build-'));
assert(!readdirSync(dir).some(n=>/^\.env(?:\.|$)/.test(n)),'Build copy must contain no environment files');
const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS:'1',
  DATABASE_URL:'postgresql://postgres@127.0.0.1:55439/build_unused?connect_timeout=2',
  DIRECT_URL:'postgresql://postgres@127.0.0.1:55439/build_unused?connect_timeout=2',
  NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55438',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-build-placeholder',
  SUPABASE_SERVICE_ROLE_KEY:'local-build-placeholder',JWT_SECRET:'local-build-placeholder-not-a-production-secret'});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,env,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){
  if(/(^|\/)(\.env[^/]*|certs|backups|\.codex)(\/|$)|\.(dump|crt|pem|key|log)$/i.test(file))continue;
  const target=path.join(dir,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join(root,file),target);
}
assert.equal(JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).scripts.build,'prisma generate && next build');
console.log(`Credential-free source copy: ${dir}`);
// A real copy keeps Turbopack resolution inside its project root; no source/env symlinks.
if(!reuse)cpSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),{recursive:true});
const run=(args)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:dir,env,stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Local build step failed (${code})`)));
});
await run(['node_modules/prisma/build/index.js','generate']);
await run(['node_modules/next/dist/bin/next','build']);
console.log('Migration-free isolated production-style build: PASS');
