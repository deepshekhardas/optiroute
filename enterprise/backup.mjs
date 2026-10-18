import {DatabaseSync,backup} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
const source=resolve(process.env.OPTIR_DB||'runtime/operations.sqlite'),destination=process.argv[2];
if(!destination)throw Error('Usage: node enterprise/backup.mjs NEW_BACKUP_PATH');
const target=resolve(destination);
if(source===target||existsSync(target))throw Error('Choose a new backup path; overwriting is not allowed');
mkdirSync(dirname(target),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);}finally{db.close();}
const check=new DatabaseSync(target,{readOnly:true});
try{
 if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup integrity check failed');
 if(check.prepare('PRAGMA user_version').get().user_version!==1)throw Error('Unexpected schema version');
 console.log('Consistent backup created and integrity checked. Treat the file as confidential company data.');
}finally{check.close();}
