import {build} from 'esbuild';
await build({entryPoints:['enterprise/server.mjs'],outfile:'enterprise-dist/service.mjs',bundle:true,platform:'node',format:'esm',packages:'external',target:'node24',legalComments:'inline'});
console.log('Operations service artifact built; Node dependencies remain external.');
