const fs=require('fs'),p='lib/language.ts';let s=fs.readFileSync(p,'utf8')
if(s.includes('NEVER_RETIRE')){console.log('language.ts already patched');process.exit(0)}
s=s.replace('const STOP = new Set(',"// Words about the entity's own acts: never auto-retired.\nconst NEVER_RETIRE = new Set(`\nmemory memories scratchpad question choice chosen choose choosing decide decision decided\ndeleted forget forgotten forgetting prediction predicted remember remembered iteration\nwhoever stranger visitor\n`.split(/\\s+/).filter(Boolean))\n\nconst STOP = new Set(")
s=s.replace('.filter(([, c]) => c >= threshold)','.filter(([w, c]) => c >= threshold && !NEVER_RETIRE.has(w))')
fs.writeFileSync(p,s);console.log('language.ts patched')
