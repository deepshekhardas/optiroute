import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore,Problem} from '../store.mjs';
import {createApi} from '../api.mjs';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';

function setup(file=':memory:'){
 const store=openStore(file);
 store.provision('alpha','Alpha Logistics','owner');
 store.provision('beta','Beta Logistics','other');
 store.member('alpha','owner','dispatch','dispatcher');
 store.member('alpha','owner','read-only','viewer');
 return store;
}
const payload={client:'Example Client',address:'Example depot',volume:40};
const code=(status)=>e=>e instanceof Problem&&e.status===status;
test('company isolation applies to orders, drivers and audit',()=>{
 const s=setup();try{
  const o=s.createOrder('alpha','owner',payload,'once').order;
  const d=s.createDriver('beta','other',{name:'Other driver',capacity:100});
  assert.throws(()=>s.orders('alpha','other'),code(403));
  assert.throws(()=>s.drivers('alpha','other'),code(403));
  assert.throws(()=>s.history('alpha','other'),code(403));
  assert.throws(()=>s.transition('beta','other',o.id,'cancelled',1),code(404));
  assert.throws(()=>s.assign('alpha','owner',o.id,d.id,1),code(404));
  assert.equal(s.orders('beta','other').length,0);
 }finally{s.close();}
});
test('server roles prevent writes and privilege escalation; last admin protected',()=>{
 const s=setup();try{
  assert.throws(()=>s.createOrder('alpha','read-only',payload,'x'),code(403));
  assert.throws(()=>s.createDriver('alpha','dispatch',{name:'A',capacity:100}),code(403));
  assert.throws(()=>s.member('alpha','dispatch','dispatch','admin'),code(403));
  assert.throws(()=>s.history('alpha','dispatch'),code(403));
  assert.throws(()=>s.member('alpha','owner','owner','viewer'),code(409));
  s.member('alpha','owner','second-admin','admin');s.member('alpha','owner','owner','viewer');
  assert.throws(()=>s.createOrder('alpha','owner',payload,'after-demotion'),code(403));
 }finally{s.close();}
});
test('create retries are idempotent, payload conflicts roll back, audit is not duplicated',()=>{
 const s=setup();try{
  const first=s.createOrder('alpha','dispatch',payload,'request-1');
  const second=s.createOrder('alpha','dispatch',payload,'request-1');
  assert.equal(first.replayed,false);assert.equal(second.replayed,true);assert.equal(first.order.id,second.order.id);
  assert.throws(()=>s.createOrder('alpha','dispatch',{...payload,volume:50},'request-1'),code(409));
  assert.equal(s.orders('alpha','owner').length,1);
  assert.equal(s.history('alpha','owner').filter(e=>e.action==='order.created').length,1);
 }finally{s.close();}
});
test('capacity checks, lifecycle constraints and stale revisions preserve data and audit atomically',()=>{
 const s=setup();try{
  const d=s.createDriver('alpha','owner',{name:'Capacity 50',capacity:50});
  const a=s.createOrder('alpha','dispatch',payload,'a').order;
  const b=s.createOrder('alpha','dispatch',{...payload,volume:20},'b').order;
  assert.throws(()=>s.transition('alpha','dispatch',a.id,'delivered',1),code(409));
  assert.equal(s.assign('alpha','dispatch',a.id,d.id,1).version,2);
  const before=s.history('alpha','owner').length;
  assert.throws(()=>s.assign('alpha','dispatch',b.id,d.id,1),code(409));
  assert.throws(()=>s.transition('alpha','dispatch',a.id,'in_transit',1),code(409));
  assert.equal(s.history('alpha','owner').length,before);
  assert.equal(s.transition('alpha','dispatch',a.id,'in_transit',2).version,3);
  s.transition('alpha','dispatch',a.id,'delivered',3);
  assert.throws(()=>s.transition('alpha','dispatch',a.id,'cancelled',4),code(409));
  assert.equal(s.assign('alpha','dispatch',b.id,d.id,1).status,'assigned');
 }finally{s.close();}
});
test('validation rejects invalid quantities and unbounded pagination',()=>{
 const s=setup();try{
  for(const volume of [0,-1,NaN,Infinity,'4',1000001])assert.throws(()=>s.createOrder('alpha','owner',{...payload,volume},'bad'),code(400));
  assert.throws(()=>s.createDriver('alpha','owner',{name:'',capacity:100}),code(400));
  assert.throws(()=>s.orders('alpha','owner',{limit:101}),code(400));
  assert.throws(()=>s.orders('alpha','owner',{before:-1}),code(400));
 }finally{s.close();}
});
test('membership revocation takes effect immediately and the last admin remains protected',()=>{
 const s=setup();try{
  assert.throws(()=>s.members('alpha','read-only'),code(403));
  assert.throws(()=>s.removeMember('alpha','owner','owner'),code(409));
  assert.throws(()=>s.removeMember('alpha','dispatch','read-only'),code(403));
  s.removeMember('alpha','owner','dispatch');
  assert.throws(()=>s.orders('alpha','dispatch'),code(403));
  assert.throws(()=>s.createOrder('alpha','dispatch',payload,'after-revoke'),code(403));
  assert.ok(s.history('alpha','owner').some(e=>e.action==='member.removed'));
 }finally{s.close();}
});
test('orders and audit survive a database reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'optiroute-')),file=join(dir,'operations.sqlite');
 let s=setup(file);const id=s.createOrder('alpha','owner',payload,'persisted').order.id;s.close();
 try{s=openStore(file);assert.equal(s.orders('alpha','owner')[0].id,id);assert.ok(s.history('alpha','owner').some(e=>e.entity===id));}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('audit cannot be rewritten and newer database schema refuses downgrade',()=>{
 const dir=mkdtempSync(join(tmpdir(),'optiroute-schema-')),file=join(dir,'operations.sqlite');
 const s=setup(file);s.close();const db=new DatabaseSync(file);
 try{
  assert.throws(()=>db.exec("UPDATE audit SET actor='rewritten'"),/append-only/);
  assert.throws(()=>db.exec('DELETE FROM audit'),/append-only/);
  db.exec('PRAGMA user_version=2');
 }finally{db.close();}
 try{assert.throws(()=>openStore(file),/newer/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('native backup helper produces a readable snapshot and refuses overwrite',()=>{
 const dir=mkdtempSync(join(tmpdir(),'optiroute-backup-')),file=join(dir,'operations.sqlite'),target=join(dir,'backup.sqlite');
 const s=setup(file);const id=s.createOrder('alpha','owner',payload,'backup').order.id;
 try{
  const result=spawnSync(process.execPath,['enterprise/backup.mjs',target],{encoding:'utf8',env:{...process.env,OPTIR_DB:file}});
  assert.equal(result.status,0,result.stderr);
  const restored=openStore(target);try{assert.equal(restored.orders('alpha','owner')[0].id,id);}finally{restored.close();}
  assert.notEqual(spawnSync(process.execPath,['enterprise/backup.mjs',target],{env:{...process.env,OPTIR_DB:file}}).status,0);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('HTTP rejects unauthenticated, forged-role, cross-company, origin and malformed requests',async()=>{
 const store=setup();const app=createApi({store,origin:'http://127.0.0.1',verifyToken:async token=>{
  if(!['owner','dispatch','read-only','other'].includes(token))throw Object.assign(Error('bad token'),{code:'auth/invalid-id-token'});return {uid:token};
 }});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,method='GET',body,uid,extra={}){return fetch(base+path,{method,headers:{...(uid?{Authorization:'Bearer '+uid}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});}
 try{
  assert.equal((await request('/api/tenants')).status,401);
  assert.equal((await request('/api/tenants','GET',undefined,'invalid')).status,401);
  assert.equal((await request('/api/tenants/alpha/orders','GET',undefined,'other')).status,403);
  assert.equal((await request('/api/tenants/alpha/orders','POST',payload,'read-only',{'Idempotency-Key':'one','X-Role':'admin'})).status,403);
  assert.equal((await request('/api/tenants/alpha/orders','POST',payload,'owner',{Origin:'https://untrusted.example','Idempotency-Key':'two'})).status,403);
  assert.equal((await request('/api/tenants/alpha/orders','POST','{','owner')).status,400);
  const initial=await request('/api/tenants/alpha/orders','POST',payload,'dispatch',{'Idempotency-Key':'http-one'});assert.equal(initial.status,201);
  const replay=await request('/api/tenants/alpha/orders','POST',payload,'dispatch',{'Idempotency-Key':'http-one'});assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await request('/api/tenants/alpha/members/read-only','PUT',{role:'admin'},'read-only')).status,403);
  assert.equal((await request('/api/unknown','GET',undefined,'owner')).status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
test('identity provider failure is unavailable, not an invalid-user verdict',async()=>{
 const store=setup();const server=createApi({store,origin:'http://127.0.0.1',verifyToken:async()=>{throw Error('private upstream error');}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/tenants',{headers:{Authorization:'Bearer example'}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Sign-in verification service unavailable'});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
