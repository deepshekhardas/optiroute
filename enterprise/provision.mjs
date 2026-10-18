import { openStore } from './store.mjs';
const [tenant,name,uid]=process.argv.slice(2);
if(!tenant||!name||!uid)throw new Error('Usage: node enterprise/provision.mjs TENANT COMPANY_NAME VERIFIED_FIREBASE_UID');
const store=openStore(process.env.OPTIR_DB||'runtime/operations.sqlite');
try {store.provision(tenant,name,uid);console.log('Company and initial administrator created.');} finally {store.close();}
