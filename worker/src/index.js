const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' } });
const now = () => new Date().toISOString();
const uid = (prefix='id') => `${prefix}_${crypto.randomUUID().replaceAll('-','').slice(0,18)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function originFor(env) { return env.CORS_ORIGIN || '*'; }
async function body(request) { try { return await request.json(); } catch { return {}; } }
async function sha256Hex(input) { const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input; const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function hmacHex(keyBytes, message) { const key = await crypto.subtle.importKey('raw', keyBytes, {name:'HMAC',hash:'SHA-256'}, false, ['sign']); const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)); return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function timingSafeEqual(a,b){ if(a.length!==b.length) return false; let r=0; for(let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; }

async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return { ok:false, error:'missing_telegram_auth' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!hash || !authDate) return {ok:false,error:'invalid_init_data'};
  if (Date.now()/1000 - authDate > 86400) return {ok:false,error:'telegram_auth_expired'};
  params.delete('hash');
  const pairs = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = await hmacRaw(new TextEncoder().encode('WebAppData'), new TextEncoder().encode(botToken));
  const expected = await hmacHex(secret, pairs);
  if (!timingSafeEqual(expected,hash)) return {ok:false,error:'telegram_auth_invalid'};
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  if (!user?.id) return {ok:false,error:'telegram_user_missing'};
  return {ok:true,user};
}
async function hmacRaw(keyBytes, messageBytes){ const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC',key,messageBytes)); }

async function requireTg(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('tma ')) return {ok:false,response:json({error:'telegram_auth_required'},401,originFor(env))};
  const r = await validateTelegramInitData(header.slice(4), env.BOT_TOKEN);
  if (!r.ok) return {ok:false,response:json({error:r.error},401,originFor(env))};
  await upsertUser(env.DB, r.user);
  const u = await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(String(r.user.id)).first();
  if (u?.blocked) return {ok:false,response:json({error:'user_blocked'},403,originFor(env))};
  return {ok:true,user:r.user,dbUser:u};
}

function adminHeader(request){ const h=request.headers.get('Authorization')||''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }
async function requireAdmin(request, env){
  const token=adminHeader(request); if(!token) return {ok:false,response:json({error:'admin_auth_required'},401,originFor(env))};
  const hash=await sha256Hex(token);
  const row=await env.DB.prepare(`SELECT s.*, a.role, a.name, a.active FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1`).bind(hash,now()).first();
  if(!row) return {ok:false,response:json({error:'admin_session_invalid'},401,originFor(env))};
  return {ok:true,admin:row};
}
async function audit(env, actorType, actorId, action, entityType, entityId, meta={}){
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_type,actor_id,action,entity_type,entity_id,meta_json) VALUES(?,?,?,?,?,?,?)').bind(uid('audit'),actorType,String(actorId||''),action,entityType,String(entityId||''),JSON.stringify(meta)).run();
}
async function upsertUser(db,u){
  const referral = u?.start_param || '';
  await db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,language_code,referral_code,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,language_code=excluded.language_code,updated_at=CURRENT_TIMESTAMP`).bind(String(u.id),u.username||'',u.first_name||'',u.last_name||'',u.language_code||'',referral||null).run();
}
async function settings(db){ const rows=await db.prepare('SELECT key,value FROM settings').all(); return Object.fromEntries((rows.results||[]).map(r=>[r.key,r.value])); }
async function bootstrap(env, auth){
  const [s,m,sets,orders,wallet,tickets] = await Promise.all([
    env.DB.prepare('SELECT * FROM services WHERE active=1 ORDER BY featured DESC, sort_order ASC, created_at DESC').all(),
    env.DB.prepare('SELECT * FROM market_items WHERE active=1 ORDER BY featured DESC, sort_order ASC, created_at DESC').all(),
    settings(env.DB),
    env.DB.prepare('SELECT id,title,total,status,created_at,updated_at FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 20').bind(String(auth.user.id)).all(),
    env.DB.prepare('SELECT balance,cashback_balance FROM users WHERE telegram_id=?').bind(String(auth.user.id)).first(),
    env.DB.prepare('SELECT id,subject,status,priority,last_message_at FROM tickets WHERE telegram_id=? ORDER BY last_message_at DESC LIMIT 10').bind(String(auth.user.id)).all()
  ]);
  return {services:s.results||[],market:m.results||[],settings:sets,user:auth.dbUser,wallet,walletBalance:wallet,tickets:tickets.results||[],orders:orders.results||[]};
}
async function createOrder(env, auth, input){
  const service=input.service_id ? await env.DB.prepare('SELECT * FROM services WHERE id=? AND active=1').bind(input.service_id).first():null;
  const market=input.market_item_id ? await env.DB.prepare('SELECT * FROM market_items WHERE id=? AND active=1').bind(input.market_item_id).first():null;
  const item=service||market; if(!item) throw new Error('item_not_found');
  const qty=Math.max(1,Number(input.qty||1));
  if(service && (qty<service.min_qty || qty>service.max_qty)) throw new Error('quantity_out_of_range');
  if(item.stock>=0 && qty>item.stock) throw new Error('out_of_stock');
  const base=Math.round(Number(item.price||0)*qty);
  let discount=0, coupon=null;
  if(input.coupon){
    coupon=await env.DB.prepare('SELECT * FROM coupons WHERE code=? AND active=1').bind(String(input.coupon).trim().toUpperCase()).first();
    if(!coupon) throw new Error('coupon_invalid');
    const t=Date.now(); if(coupon.starts_at && t<new Date(coupon.starts_at).getTime()) throw new Error('coupon_not_started'); if(coupon.ends_at && t>new Date(coupon.ends_at).getTime()) throw new Error('coupon_expired'); if(coupon.usage_limit && coupon.used_count>=coupon.usage_limit) throw new Error('coupon_limit'); if(coupon.min_order && base<coupon.min_order) throw new Error('coupon_min_order'); if(coupon.service_id && coupon.service_id!==item.id) throw new Error('coupon_service_mismatch');
    discount=coupon.type==='percent'?Math.floor(base*Number(coupon.value)/100):Math.floor(Number(coupon.value)); if(coupon.max_discount) discount=Math.min(discount,Number(coupon.max_discount)); discount=Math.min(discount,base);
  }
  const total=Math.max(0,base-discount), id=uid('DS');
  await env.DB.prepare(`INSERT INTO orders(id,telegram_id,service_id,market_item_id,coupon_id,title,payload_json,total,discount,payment_method,status,fulfillment_status,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,String(auth.user.id),service?.id||null,market?.id||null,coupon?.id||null,item.title||item.name,JSON.stringify(input.fields||{}),total,discount,input.payment_method||'stars','pending','queued',input.note||'').run();
  await env.DB.prepare('INSERT INTO order_events(id,order_id,event_type,message,actor_type) VALUES(?,?,?,?,?)').bind(uid('evt'),id,'created','سفارش ثبت شد','user').run();
  if(coupon) await env.DB.prepare('UPDATE coupons SET used_count=used_count+1 WHERE id=?').bind(coupon.id).run();
  return {id,total,discount,title:item.title||item.name,status:'pending'};
}
async function botCall(env, method, payload){ const r=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const data=await r.json(); if(!data.ok) throw new Error(data.description||'telegram_api_error'); return data.result; }

async function handleAdmin(request, env, path){
  if(path==='/api/admin/login' && request.method==='POST'){
    const b=await body(request); if(!b.key || !env.ADMIN_KEY || !timingSafeEqual(String(b.key),String(env.ADMIN_KEY))) return json({error:'invalid_admin_key'},401,originFor(env));
    const admin=await env.DB.prepare("SELECT * FROM admins WHERE active=1 ORDER BY created_at ASC LIMIT 1").first(); if(!admin) return json({error:'no_admin'},503,originFor(env));
    const raw=crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''); const hash=await sha256Hex(raw); const ttl=Number(env.ADMIN_SESSION_TTL_SECONDS||43200); const expires=new Date(Date.now()+ttl*1000).toISOString();
    await env.DB.prepare('INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').bind(hash,admin.id,expires).run();
    await audit(env,'admin',admin.id,'login','admin',admin.id); return json({token:raw,expires_at:expires,admin:{id:admin.id,name:admin.name,role:admin.role}},200,originFor(env));
  }
  const auth=await requireAdmin(request,env); if(!auth.ok) return auth.response;
  if(path==='/api/admin/logout' && request.method==='POST'){ const hash=await sha256Hex(adminHeader(request)); await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(hash).run(); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/dashboard'){
    const [stats,recent,serviceCount,marketCount,tickets] = await Promise.all([
      env.DB.prepare(`SELECT (SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM services WHERE active=1) services,(SELECT COUNT(*) FROM market_items WHERE active=1) market,(SELECT COALESCE(SUM(total),0) FROM orders WHERE status='completed') revenue`).first(),
      env.DB.prepare(`SELECT o.*,u.username,u.first_name FROM orders o LEFT JOIN users u ON u.telegram_id=o.telegram_id ORDER BY o.created_at DESC LIMIT 12`).all(),
      env.DB.prepare('SELECT COUNT(*) n FROM services WHERE active=1').first(), env.DB.prepare('SELECT COUNT(*) n FROM market_items WHERE active=1').first(),
      env.DB.prepare("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','pending')").first()
    ]); return json({stats,orders:recent.results||[],ticketCount:tickets?.n||0},200,originFor(env));
  }
  if(path==='/api/admin/services' && request.method==='GET') return json({items:(await env.DB.prepare('SELECT * FROM services ORDER BY sort_order ASC,created_at DESC').all()).results||[]},200,originFor(env));
  if(path==='/api/admin/services' && ['POST','PUT'].includes(request.method)){
    const b=await body(request); const id=b.id||uid('svc'); await env.DB.prepare(`INSERT INTO services(id,title,description,icon,image_url,category,price,compare_at_price,unit,min_qty,max_qty,stock,eta_minutes,tags,featured,active,sort_order,rules,fields_schema)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,icon=excluded.icon,image_url=excluded.image_url,category=excluded.category,price=excluded.price,compare_at_price=excluded.compare_at_price,unit=excluded.unit,min_qty=excluded.min_qty,max_qty=excluded.max_qty,stock=excluded.stock,eta_minutes=excluded.eta_minutes,tags=excluded.tags,featured=excluded.featured,active=excluded.active,sort_order=excluded.sort_order,rules=excluded.rules,fields_schema=excluded.fields_schema,updated_at=CURRENT_TIMESTAMP`).bind(id,b.title||'',b.description||'',b.icon||'✦',b.image_url||'',b.category||'general',Number(b.price||0),Number(b.compare_at_price||0),b.unit||'تومان',Number(b.min_qty||1),Number(b.max_qty||1),Number(b.stock??-1),Number(b.eta_minutes||0),Array.isArray(b.tags)?b.tags.join(','):String(b.tags||''),b.featured?1:0,b.active===false?0:1,Number(b.sort_order||0),b.rules||'',typeof b.fields_schema==='string'?b.fields_schema:JSON.stringify(b.fields_schema||[])).run(); await audit(env,'admin',auth.admin.admin_id,'upsert','service',id,{title:b.title}); return json({ok:true,id},200,originFor(env));
  }
  if(path==='/api/admin/services' && request.method==='DELETE'){ const b=await body(request); await env.DB.prepare('UPDATE services SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.id).run(); await audit(env,'admin',auth.admin.admin_id,'disable','service',b.id); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/market' && request.method==='GET') return json({items:(await env.DB.prepare('SELECT * FROM market_items ORDER BY sort_order ASC,created_at DESC').all()).results||[]},200,originFor(env));
  if(path==='/api/admin/market' && ['POST','PUT'].includes(request.method)){ const b=await body(request); const id=b.id||uid('gift'); await env.DB.prepare(`INSERT INTO market_items(id,name,number,image_url,discount,price,original_price,rarity,telegram_url,market_url,stock,featured,active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,number=excluded.number,image_url=excluded.image_url,discount=excluded.discount,price=excluded.price,original_price=excluded.original_price,rarity=excluded.rarity,telegram_url=excluded.telegram_url,market_url=excluded.market_url,stock=excluded.stock,featured=excluded.featured,active=excluded.active,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`).bind(id,b.name||'',b.number||null,b.image_url||'',Number(b.discount||0),Number(b.price||0),Number(b.original_price||0),b.rarity||'',b.telegram_url||'',b.market_url||'',Number(b.stock||0),b.featured?1:0,b.active===false?0:1,Number(b.sort_order||0)).run(); await audit(env,'admin',auth.admin.admin_id,'upsert','market',id,{name:b.name}); return json({ok:true,id},200,originFor(env)); }
  if(path==='/api/admin/market' && request.method==='DELETE'){ const b=await body(request); await env.DB.prepare('UPDATE market_items SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.id).run(); await audit(env,'admin',auth.admin.admin_id,'disable','market',b.id); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/orders' && request.method==='GET'){ const url=new URL(request.url), status=url.searchParams.get('status'); const q=status?env.DB.prepare(`SELECT o.*,u.username,u.first_name,u.last_name FROM orders o LEFT JOIN users u ON u.telegram_id=o.telegram_id WHERE o.status=? ORDER BY o.created_at DESC LIMIT 200`).bind(status):env.DB.prepare(`SELECT o.*,u.username,u.first_name,u.last_name FROM orders o LEFT JOIN users u ON u.telegram_id=o.telegram_id ORDER BY o.created_at DESC LIMIT 200`); return json({items:(await q.all()).results||[]},200,originFor(env)); }
  if(path==='/api/admin/orders/status' && request.method==='PATCH'){ const b=await body(request); const allowed=['pending','processing','completed','cancelled']; if(!allowed.includes(b.status)) return json({error:'invalid_status'},400,originFor(env)); await env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.status,b.id).run(); await env.DB.prepare('INSERT INTO order_events(id,order_id,event_type,message,actor_type,actor_id) VALUES(?,?,?,?,?,?)').bind(uid('evt'),b.id,'status_change',`وضعیت → ${b.status}`,'admin',auth.admin.admin_id).run(); if(b.status==='processing') await env.DB.prepare("UPDATE orders SET fulfillment_status='in_progress' WHERE id=?").bind(b.id).run(); if(b.status==='completed') await env.DB.prepare("UPDATE orders SET fulfillment_status='completed' WHERE id=?").bind(b.id).run(); await audit(env,'admin',auth.admin.admin_id,'status_change','order',b.id,{status:b.status}); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/orders/note' && request.method==='PATCH'){ const b=await body(request); await env.DB.prepare('UPDATE orders SET admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.admin_note||'',b.id).run(); await audit(env,'admin',auth.admin.admin_id,'note','order',b.id); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/users' && request.method==='GET'){ const res=await env.DB.prepare('SELECT u.*,v.name vip_name,(SELECT COUNT(*) FROM orders o WHERE o.telegram_id=u.telegram_id) order_count,(SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.telegram_id=u.telegram_id AND o.status="completed") spend FROM users u LEFT JOIN vip_tiers v ON v.id=u.vip_tier_id ORDER BY u.created_at DESC LIMIT 300').all(); return json({items:res.results||[]},200,originFor(env)); }
  if(path==='/api/admin/users/block' && request.method==='PATCH'){ const b=await body(request); await env.DB.prepare('UPDATE users SET blocked=?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?').bind(b.blocked?1:0,String(b.telegram_id)).run(); await audit(env,'admin',auth.admin.admin_id,b.blocked?'block':'unblock','user',String(b.telegram_id)); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/coupons' && request.method==='GET') return json({items:(await env.DB.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()).results||[]},200,originFor(env));
  if(path==='/api/admin/coupons' && ['POST','PUT'].includes(request.method)){ const b=await body(request); const id=b.id||uid('coup'); await env.DB.prepare(`INSERT INTO coupons(id,code,type,value,min_order,max_discount,usage_limit,starts_at,ends_at,service_id,active) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,type=excluded.type,value=excluded.value,min_order=excluded.min_order,max_discount=excluded.max_discount,usage_limit=excluded.usage_limit,starts_at=excluded.starts_at,ends_at=excluded.ends_at,service_id=excluded.service_id,active=excluded.active`).bind(id,String(b.code||'').toUpperCase(),b.type||'percent',Number(b.value||0),Number(b.min_order||0),Number(b.max_discount||0),Number(b.usage_limit||0),b.starts_at||null,b.ends_at||null,b.service_id||null,b.active===false?0:1).run(); await audit(env,'admin',auth.admin.admin_id,'upsert','coupon',id,{code:b.code}); return json({ok:true,id},200,originFor(env)); }
  if(path==='/api/admin/coupons' && request.method==='DELETE'){ const b=await body(request); await env.DB.prepare('UPDATE coupons SET active=0 WHERE id=?').bind(b.id).run(); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/tickets' && request.method==='GET'){ const res=await env.DB.prepare('SELECT t.*,u.username,u.first_name FROM tickets t LEFT JOIN users u ON u.telegram_id=t.telegram_id ORDER BY t.last_message_at DESC LIMIT 200').all(); return json({items:res.results||[]},200,originFor(env)); }
  if(path==='/api/admin/tickets/reply' && request.method==='POST'){ const b=await body(request); await env.DB.prepare('INSERT INTO ticket_messages(id,ticket_id,sender_type,sender_id,message) VALUES(?,?,?,?,?)').bind(uid('msg'),b.ticket_id,'admin',auth.admin.admin_id,String(b.message||'')).run(); await env.DB.prepare("UPDATE tickets SET status='pending',last_message_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.ticket_id).run(); const t=await env.DB.prepare('SELECT telegram_id FROM tickets WHERE id=?').bind(b.ticket_id).first(); if(t?.telegram_id && env.BOT_TOKEN) await botCall(env,'sendMessage',{chat_id:Number(t.telegram_id),text:`🎫 پاسخ پشتیبانی Duck Store\n\n${String(b.message||'')}`}); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/settings' && request.method==='GET') return json({settings:await settings(env.DB)},200,originFor(env));
  if(path==='/api/admin/settings' && request.method==='PUT'){ const b=await body(request); for(const [k,v] of Object.entries(b)) await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(k,String(v??'')).run(); await audit(env,'admin',auth.admin.admin_id,'update','settings','global',b); return json({ok:true},200,originFor(env)); }
  if(path==='/api/admin/analytics'){
    const [daily,top] = await Promise.all([env.DB.prepare(`SELECT substr(created_at,1,10) day,COUNT(*) orders,COALESCE(SUM(total),0) revenue FROM orders WHERE created_at>=datetime('now','-30 days') GROUP BY day ORDER BY day`).all(),env.DB.prepare(`SELECT title,COUNT(*) orders,COALESCE(SUM(total),0) revenue FROM orders WHERE status='completed' GROUP BY title ORDER BY orders DESC LIMIT 10`).all()]); return json({daily:daily.results||[],top:top.results||[]},200,originFor(env));
  }
  if(path==='/api/admin/audit' && request.method==='GET') return json({items:(await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all()).results||[]},200,originFor(env));
  return json({error:'admin_route_not_found'},404,originFor(env));
}

export default { async fetch(request, env) {
  const origin=originFor(env); if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}});
  const url=new URL(request.url), path=url.pathname;
  try {
    if(path==='/health') return json({ok:true,service:'duck-store-api',time:now()},200,origin);
    if(path.startsWith('/api/admin/')) return await handleAdmin(request,env,path);
    if(path==='/api/bootstrap') { const a=await requireTg(request,env); if(!a.ok) return a.response; return json(await bootstrap(env,a),200,origin); }
    if(path==='/api/services' && request.method==='GET') return json({items:(await env.DB.prepare('SELECT * FROM services WHERE active=1 ORDER BY featured DESC,sort_order ASC').all()).results||[]},200,origin);
    if(path==='/api/market' && request.method==='GET') return json({items:(await env.DB.prepare('SELECT * FROM market_items WHERE active=1 ORDER BY featured DESC,sort_order ASC').all()).results||[]},200,origin);
    if(path==='/api/orders' && request.method==='GET'){ const a=await requireTg(request,env); if(!a.ok)return a.response; const rows=await env.DB.prepare('SELECT * FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 50').bind(String(a.user.id)).all(); return json({items:rows.results||[]},200,origin); }
    if(path==='/api/orders' && request.method==='POST'){ const a=await requireTg(request,env); if(!a.ok)return a.response; try{return json(await createOrder(env,a,await body(request)),200,origin)}catch(e){return json({error:e.message||'order_create_failed'},400,origin)} }
    if(path==='/api/orders/:id'){}
    if(path.startsWith('/api/orders/') && request.method==='GET'){ const a=await requireTg(request,env); if(!a.ok)return a.response; const id=path.split('/').pop(); const order=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND telegram_id=?').bind(id,String(a.user.id)).first(); if(!order)return json({error:'not_found'},404,origin); const events=await env.DB.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY created_at ASC').bind(id).all(); return json({order,events:events.results||[]},200,origin); }
    if(path==='/api/coupon/validate' && request.method==='POST'){ const a=await requireTg(request,env); if(!a.ok)return a.response; const b=await body(request); const c=await env.DB.prepare('SELECT id,code,type,value,min_order,max_discount,usage_limit,used_count,starts_at,ends_at,service_id,active FROM coupons WHERE code=? AND active=1').bind(String(b.code||'').trim().toUpperCase()).first(); if(!c)return json({valid:false,error:'not_found'},200,origin); return json({valid:true,coupon:c},200,origin); }
    if(path==='/api/tickets' && request.method==='GET'){ const a=await requireTg(request,env); if(!a.ok)return a.response; const ts=await env.DB.prepare('SELECT * FROM tickets WHERE telegram_id=? ORDER BY last_message_at DESC').bind(String(a.user.id)).all(); return json({items:ts.results||[]},200,origin); }
    if(path==='/api/tickets' && request.method==='POST'){ const a=await requireTg(request,env); if(!a.ok)return a.response; const b=await body(request), id=uid('TKT'); await env.DB.prepare('INSERT INTO tickets(id,telegram_id,order_id,subject,category,priority) VALUES(?,?,?,?,?,?)').bind(id,String(a.user.id),b.order_id||null,b.subject||'درخواست پشتیبانی',b.category||'other',b.priority||'normal').run(); await env.DB.prepare('INSERT INTO ticket_messages(id,ticket_id,sender_type,sender_id,message) VALUES(?,?,?,?,?)').bind(uid('msg'),id,'user',String(a.user.id),b.message||'').run(); return json({id},200,origin); }
    if(path==='/api/stars/invoice' && request.method==='POST'){ const a=await requireTg(request,env); if(!a.ok)return a.response; const b=await body(request); const order=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND telegram_id=?').bind(b.order_id,String(a.user.id)).first(); if(!order)return json({error:'order_not_found'},404,origin); if(!env.BOT_TOKEN)return json({error:'bot_token_missing'},503,origin); const stars=Number(b.stars||0); if(stars<1) return json({error:'stars_amount_required'},400,origin); const link=await botCall(env,'createInvoiceLink',{title:`Duck Store — ${order.title}`,description:`سفارش ${order.id}`,payload:JSON.stringify({order_id:order.id,telegram_id:String(a.user.id)}),provider_token:'',currency:'XTR',prices:[{label:order.title,amount:Math.round(stars)}]}); return json({invoice_url:link},200,origin); }
    if(path==='/telegram/webhook' && request.method==='POST'){ const update=await body(request); if(update.pre_checkout_query && env.BOT_TOKEN) await botCall(env,'answerPreCheckoutQuery',{pre_checkout_query_id:update.pre_checkout_query.id,ok:true}); const sp=update.message?.successful_payment; if(sp?.invoice_payload){ let p={}; try{p=JSON.parse(sp.invoice_payload)}catch{}; if(p.order_id){ await env.DB.prepare('UPDATE orders SET status="processing",payment_method="stars",updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.order_id).run(); await env.DB.prepare('INSERT INTO payments(id,order_id,telegram_id,provider,provider_charge_id,payload_json,amount,currency,status) VALUES(?,?,?,?,?,?,?,?,?)').bind(uid('pay'),p.order_id,String(p.telegram_id||update.message?.chat?.id||''),'telegram_stars',sp.telegram_payment_charge_id,JSON.stringify(sp),Number(sp.total_amount||0),'XTR','paid').run(); await env.DB.prepare('INSERT INTO order_events(id,order_id,event_type,message,actor_type) VALUES(?,?,?,?,?)').bind(uid('evt'),p.order_id,'payment','پرداخت Stars با موفقیت تأیید شد','telegram').run(); } } return json({ok:true},200,origin); }
    return json({error:'not_found'},404,origin);
  } catch (e) { console.error(e); return json({error:'internal_error',message:env.ENVIRONMENT==='production'?'خطای داخلی':String(e.message||e)},500,origin); }
} };
