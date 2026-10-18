import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new Problem(status, message); };
const text = (value, name, max = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Invalid ${name}`);
  return value.trim();
};
const number = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000000) fail(400, `Invalid ${name}`);
  return value;
};

export function openStore(filename = ':memory:') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  if (db.prepare('PRAGMA user_version').get().user_version > 1) { db.close(); throw new Error('Database schema is newer than this service'); }
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS members(tenant TEXT REFERENCES tenants(id), uid TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','dispatcher','viewer')), PRIMARY KEY(tenant,uid)) STRICT;
    CREATE TABLE IF NOT EXISTS drivers(id TEXT NOT NULL, tenant TEXT REFERENCES tenants(id), name TEXT NOT NULL,
      capacity REAL NOT NULL CHECK(capacity > 0), PRIMARY KEY(tenant,id)) STRICT;
    CREATE TABLE IF NOT EXISTS orders(id TEXT NOT NULL, tenant TEXT REFERENCES tenants(id), client TEXT NOT NULL,
      address TEXT NOT NULL, volume REAL NOT NULL CHECK(volume > 0), driver TEXT,
      status TEXT NOT NULL CHECK(status IN ('queued','assigned','in_transit','delivered','cancelled')),
      version INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL,
      PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,driver) REFERENCES drivers(tenant,id)) STRICT;
    CREATE INDEX IF NOT EXISTS order_listing ON orders(tenant,created,id);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT REFERENCES tenants(id),
      actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL) STRICT;
    CREATE INDEX IF NOT EXISTS audit_listing ON audit(tenant,id);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
    CREATE TABLE IF NOT EXISTS requests(tenant TEXT REFERENCES tenants(id), actor TEXT NOT NULL, key TEXT NOT NULL,
      fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(tenant,actor,key)) STRICT;
    PRAGMA user_version=1;`);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const audit = (tenant, uid, action, entity, detail = {}) => db.prepare('INSERT INTO audit(tenant,actor,action,entity,detail,at) VALUES(?,?,?,?,?,?)')
    .run(tenant,uid,action,entity,JSON.stringify(detail),new Date().toISOString());
  const requireRole = (tenant, uid, write = false, admin = false) => {
    const member = db.prepare('SELECT role FROM members WHERE tenant=? AND uid=?').get(tenant,uid);
    if (!member || (write && member.role === 'viewer') || (admin && member.role !== 'admin')) fail(403,'Access denied');
    return member.role;
  };
  const order = (tenant,id) => db.prepare('SELECT * FROM orders WHERE tenant=? AND id=?').get(tenant,id) || fail(404,'Order not found');
  const checkVersion = (row, version) => {
    if (!Number.isSafeInteger(version) || version < 1) fail(400,'A valid version is required');
    if (row.version !== version) fail(409,'Order changed. Refresh before retrying.');
  };
  return {
    close: () => db.close(),
    // Trusted operator setup only; never expose provisioning as an unauthenticated HTTP route.
    provision(tenant, name, uid) {
      text(tenant,'tenant',100); text(name,'company',100); text(uid,'uid',128);
      return transaction(() => {
        if (db.prepare('SELECT id FROM tenants WHERE id=?').get(tenant)) fail(409,'Tenant already exists');
        db.prepare('INSERT INTO tenants VALUES(?,?)').run(tenant,name);
        db.prepare('INSERT INTO members VALUES(?,?,?)').run(tenant,uid,'admin');
        audit(tenant,uid,'tenant.created',tenant);
      });
    },
    tenants(uid) { return db.prepare('SELECT t.id,t.name,m.role FROM tenants t JOIN members m ON t.id=m.tenant WHERE m.uid=? ORDER BY t.name').all(uid); },
    members(tenant,uid) { requireRole(tenant,uid,false,true);return db.prepare('SELECT uid,role FROM members WHERE tenant=? ORDER BY uid').all(tenant); },
    removeMember(tenant,uid,target) {
      return transaction(()=>{
        requireRole(tenant,uid,false,true);
        const current=db.prepare('SELECT role FROM members WHERE tenant=? AND uid=?').get(tenant,target);
        if(!current)fail(404,'Member not found');
        if(current.role==='admin'&&db.prepare("SELECT COUNT(*) AS n FROM members WHERE tenant=? AND role='admin'").get(tenant).n<=1)fail(409,'The last admin cannot be removed');
        db.prepare('DELETE FROM members WHERE tenant=? AND uid=?').run(tenant,target);
        audit(tenant,uid,'member.removed',target);return {removed:true};
      });
    },
    member(tenant,uid,target,role) {
      text(target,'member UID',128);
      if (!['admin','dispatcher','viewer'].includes(role)) fail(400,'Invalid role');
      return transaction(() => {
        requireRole(tenant,uid,false,true);
        const current = db.prepare('SELECT role FROM members WHERE tenant=? AND uid=?').get(tenant,target);
        const admins = db.prepare("SELECT COUNT(*) AS n FROM members WHERE tenant=? AND role='admin'").get(tenant).n;
        if (current?.role === 'admin' && role !== 'admin' && admins <= 1) fail(409,'The last admin cannot be demoted');
        db.prepare('INSERT INTO members VALUES(?,?,?) ON CONFLICT(tenant,uid) DO UPDATE SET role=excluded.role').run(tenant,target,role);
        audit(tenant,uid,'member.role_changed',target,{role});
        return {uid:target,role};
      });
    },
    drivers(tenant,uid) { requireRole(tenant,uid); return db.prepare('SELECT id,name,capacity FROM drivers WHERE tenant=? ORDER BY name').all(tenant); },
    createDriver(tenant,uid,input) {
      const name=text(input.name,'driver name',100), capacity=number(input.capacity,'capacity');
      return transaction(() => {
        requireRole(tenant,uid,false,true);
        const id=randomUUID(); db.prepare('INSERT INTO drivers VALUES(?,?,?,?)').run(id,tenant,name,capacity);
        audit(tenant,uid,'driver.created',id,{capacity}); return {id,name,capacity};
      });
    },
    orders(tenant,uid,{limit=50,before}={}) {
      requireRole(tenant,uid);
      if (!Number.isSafeInteger(limit) || limit<1 || limit>100) fail(400,'Invalid page size');
      if (before !== undefined && (!Number.isSafeInteger(before)||before<0)) fail(400,'Invalid page offset');
      return db.prepare('SELECT * FROM orders WHERE tenant=? ORDER BY created DESC,id LIMIT ? OFFSET ?').all(tenant,limit,before||0);
    },
    createOrder(tenant,uid,input,key) {
      const clean={client:text(input.client,'client',100),address:text(input.address,'address',300),volume:number(input.volume,'volume')};
      text(key,'idempotency key',128);
      const fingerprint=createHash('sha256').update(JSON.stringify(clean)).digest('hex');
      return transaction(() => {
        requireRole(tenant,uid,true);
        const previous=db.prepare('SELECT * FROM requests WHERE tenant=? AND actor=? AND key=?').get(tenant,uid,key);
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail(409,'Idempotency key reused for a different order');
          return {order:JSON.parse(previous.result),replayed:true};
        }
        const id=randomUUID(), at=new Date().toISOString();
        db.prepare("INSERT INTO orders VALUES(?,?,?,?,?,NULL,'queued',1,?,?)").run(id,tenant,clean.client,clean.address,clean.volume,at,at);
        const created=order(tenant,id);
        audit(tenant,uid,'order.created',id,{version:1});
        db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(tenant,uid,key,fingerprint,JSON.stringify(created));
        return {order:created,replayed:false};
      });
    },
    assign(tenant,uid,id,driverId,version) {
      text(driverId,'driver ID',100);
      return transaction(() => {
        requireRole(tenant,uid,true); const row=order(tenant,id); checkVersion(row,version);
        if (!['queued','assigned'].includes(row.status)) fail(409,'Only queued or assigned orders can be assigned');
        const driver=db.prepare('SELECT * FROM drivers WHERE tenant=? AND id=?').get(tenant,driverId);
        if (!driver) fail(404,'Driver not found');
        const load=db.prepare("SELECT COALESCE(SUM(volume),0) AS load FROM orders WHERE tenant=? AND driver=? AND status IN ('assigned','in_transit') AND id<>?").get(tenant,driverId,id).load;
        if (load+row.volume > driver.capacity) fail(409,'Driver capacity would be exceeded');
        db.prepare("UPDATE orders SET driver=?,status='assigned',version=version+1,updated=? WHERE tenant=? AND id=?").run(driverId,new Date().toISOString(),tenant,id);
        audit(tenant,uid,'order.assigned',id,{driver:driverId,version:version+1}); return order(tenant,id);
      });
    },
    transition(tenant,uid,id,status,version) {
      return transaction(() => {
        requireRole(tenant,uid,true); const row=order(tenant,id); checkVersion(row,version);
        const allowed={queued:['cancelled'],assigned:['in_transit','cancelled'],in_transit:['delivered'],delivered:[],cancelled:[]};
        if (!allowed[row.status].includes(status)) fail(409,'Invalid order status transition');
        db.prepare('UPDATE orders SET status=?,version=version+1,updated=? WHERE tenant=? AND id=?').run(status,new Date().toISOString(),tenant,id);
        audit(tenant,uid,'order.status_changed',id,{from:row.status,to:status,version:version+1}); return order(tenant,id);
      });
    },
    history(tenant,uid,after=0) {
      requireRole(tenant,uid,false,true);
      if (!Number.isSafeInteger(after)||after<0) fail(400,'Invalid audit cursor');
      return db.prepare('SELECT id,actor,action,entity,detail,at FROM audit WHERE tenant=? AND id>? ORDER BY id LIMIT 100').all(tenant,after);
    },
  };
}
