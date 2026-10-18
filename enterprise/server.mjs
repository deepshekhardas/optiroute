import { openStore } from './store.mjs';
import { createApi } from './api.mjs';
import express from 'express';
import { resolve } from 'node:path';

const localDemo=process.env.OPTIR_LOCAL_DEMO==='1';
if(localDemo&&process.env.NODE_ENV==='production')throw new Error('Local demo mode cannot run in production');
if(!localDemo&&process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Production service does not allow an authentication emulator');
const port=Number(process.env.PORT||4185);
const origin=process.env.APP_ORIGIN||(localDemo?`http://127.0.0.1:${port}`:'');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
if(origin&&new URL(origin).origin!==origin)throw new Error('APP_ORIGIN must be an exact origin, without a path');
if(!localDemo&&(!origin.startsWith('https://')||!process.env.FIREBASE_PROJECT_ID))throw new Error('Set HTTPS APP_ORIGIN and FIREBASE_PROJECT_ID');
const store=openStore(process.env.OPTIR_DB||'runtime/operations.sqlite');
let verifyToken;
if(localDemo) {
  if(!store.tenants('local-owner').length) {
    store.provision('sample-studio','Sample Logistics','local-owner');
    store.createDriver('sample-studio','local-owner',{name:'Demo Driver One',capacity:100});
    store.createOrder('sample-studio','local-owner',{client:'Sample client',address:'Demo depot, Example Street',volume:25},'seed-order');
  }
} else {
  const {initializeApp,applicationDefault}=await import('firebase-admin/app');
  const {getAuth}=await import('firebase-admin/auth');
  const credential=applicationDefault();
  await credential.getAccessToken(); // Refuse startup if server credentials are unavailable.
  const admin=initializeApp({credential,projectId:process.env.FIREBASE_PROJECT_ID});
  verifyToken=token=>getAuth(admin).verifyIdToken(token,true);
}
const app=createApi({store,verifyToken,origin,localDemo});
const dist=resolve('enterprise-dist');
app.use(express.static(dist,{index:'enterprise.html'}));
app.get('/',(_q,s)=>s.sendFile(resolve(dist,'enterprise.html')));
const server=app.listen(port,localDemo?'127.0.0.1':'0.0.0.0',()=>console.log(`Operations service: ${origin} (${localDemo?'LOCAL SAMPLE DATA ONLY':'verified Firebase identity'})`));
function stop(){server.close(()=>{store.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
