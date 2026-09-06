import fs from 'node:fs/promises';
const input=process.argv[2]||'public/market.json';
const output=process.argv[3]||'db/market-import.sql';
const text=await fs.readFile(input,'utf8');const rows=JSON.parse(text);
const q=v=>String(v??'').replaceAll("'","''");
const sql=rows.map(r=>`INSERT OR REPLACE INTO market_items(id,name,number,discount,price,original_price,rarity,telegram_url,market_url,stock,featured,active,sort_order) VALUES ('${q(r.id)}','${q(r.name)}',${Number(r.number||0)},${Number(r.discount||0)},${Number(r.price||0)},${Number(r.original_price||0)},'${q(r.rarity||'')}','${q(r.telegram_url||'')}','${q(r.market_url||'')}',${Number(r.stock??1)},${r.featured?1:0},${r.active===false?0:1},${Number(r.sort_order||0)});`).join('\n');
await fs.writeFile(output,sql);console.log(`Imported ${rows.length} market rows to ${output}`);
