import express from 'express';
import { randomUUID } from 'node:crypto';
import { Problem } from './store.mjs';

export function createApi({store,verifyToken,origin,localDemo=false}) {
  if (!origin) throw new Error('An exact APP_ORIGIN is required');
  const app=express(), buckets=new Map();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Request-ID':randomUUID()});
    next();
  });
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'optiroute-operations',schema:1}));
  app.get('/api/config',(_req,res)=>res.json({mode:localDemo?'local-demo':'firebase'}));
  app.use('/api',(req,res,next)=>{
    const permittedHosts=localDemo?['127.0.0.1','localhost']:[new URL(origin).hostname];
    if(!permittedHosts.includes(req.hostname))return res.status(403).json({error:'Host not allowed'});
    if (req.headers.origin && req.headers.origin!==origin) return res.status(403).json({error:'Origin not allowed'});
    if (['POST','PUT','PATCH'].includes(req.method) && !req.is('application/json')) return res.status(415).json({error:'JSON required'});
    next();
  },express.json({limit:'16kb',strict:true}),async(req,res,next)=>{
    try {
      if (localDemo) req.actor='local-owner';
      else {
        const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
        if (!match) return res.status(401).json({error:'Sign in required'});
        try { req.actor=(await verifyToken(match[1])).uid; }
        catch (error) {
          const denied=['auth/argument-error','auth/invalid-id-token','auth/id-token-expired','auth/id-token-revoked','auth/user-disabled','auth/user-not-found'];
          return denied.includes(error?.code)
            ? res.status(401).json({error:'Invalid or expired sign-in token'})
            : res.status(503).json({error:'Sign-in verification service unavailable'});
        }
        if (typeof req.actor!=='string'||!req.actor) return res.status(401).json({error:'Invalid identity'});
      }
      const now=Date.now(), previous=buckets.get(req.actor);
      if (buckets.size>10000) for(const [key,value] of buckets) if(now-value.at>60000)buckets.delete(key);
      const current=previous&&now-previous.at<60000?previous:{at:now,count:0}; current.count++;
      buckets.set(req.actor,current);
      if(current.count>120)return res.status(429).set('Retry-After','60').json({error:'Too many requests'});
      next();
    } catch(error){next(error);}
  });
  const route=fn=>(req,res,next)=>{try{fn(req,res);}catch(error){next(error);}};
  app.get('/api/tenants',route((q,s)=>s.json(store.tenants(q.actor))));
  const root='/api/tenants/:tenant';
  app.get(root+'/drivers',route((q,s)=>s.json(store.drivers(q.params.tenant,q.actor))));
  app.post(root+'/drivers',route((q,s)=>s.status(201).json(store.createDriver(q.params.tenant,q.actor,q.body||{}))));
  app.put(root+'/members/:uid',route((q,s)=>s.json(store.member(q.params.tenant,q.actor,q.params.uid,q.body?.role))));
  app.get(root+'/members',route((q,s)=>s.json(store.members(q.params.tenant,q.actor))));
  app.delete(root+'/members/:uid',route((q,s)=>s.json(store.removeMember(q.params.tenant,q.actor,q.params.uid))));
  app.get(root+'/orders',route((q,s)=>s.json(store.orders(q.params.tenant,q.actor,{limit:q.query.limit===undefined?50:Number(q.query.limit),before:q.query.offset===undefined?0:Number(q.query.offset)}))));
  app.post(root+'/orders',route((q,s)=>{
    const result=store.createOrder(q.params.tenant,q.actor,q.body||{},q.headers['idempotency-key']);
    s.status(result.replayed?200:201).json(result);
  }));
  app.post(root+'/orders/:id/assign',route((q,s)=>s.json(store.assign(q.params.tenant,q.actor,q.params.id,q.body?.driverId,q.body?.version))));
  app.post(root+'/orders/:id/status',route((q,s)=>s.json(store.transition(q.params.tenant,q.actor,q.params.id,q.body?.status,q.body?.version))));
  app.get(root+'/audit',route((q,s)=>s.json(store.history(q.params.tenant,q.actor,q.query.after===undefined?0:Number(q.query.after)))));
  app.use('/api',(_q,s)=>s.status(404).json({error:'API route not found'}));
  app.use((error,_q,s,_next)=>{
    const status=error instanceof Problem?error.status:error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
    s.status(status).json({error:status===500?'Service error':status===413?'Request too large':status===400&&!(error instanceof Problem)?'Invalid JSON':error.message});
  });
  return app;
}
