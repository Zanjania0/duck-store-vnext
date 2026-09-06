INSERT OR IGNORE INTO settings(key,value) VALUES
('store_title','Duck Store'),
('hero_text','همه‌چیز برای تلگرام، یک‌جا و تمیز.'),
('welcome_text','به Duck Store خوش اومدی 👋'),
('support_url','https://t.me/Zanjani_a'),
('channel_url','https://t.me/duck_storee'),
('currency','تومان'),
('referral_reward','20000'),
('cashback_default','0');

INSERT OR IGNORE INTO vip_tiers(id,name,min_spend,discount_percent,cashback_percent,benefits,sort_order) VALUES
('bronze','Bronze',0,0,0,'شروع عضویت',1),
('silver','Silver',500000,2,1,'۲٪ تخفیف + ۱٪ کش‌بک',2),
('gold','Gold',2000000,5,2,'۵٪ تخفیف + ۲٪ کش‌بک',3),
('diamond','Diamond',7000000,10,4,'۱۰٪ تخفیف + ۴٪ کش‌بک',4);

INSERT OR IGNORE INTO services(id,title,description,icon,category,price,compare_at_price,unit,min_qty,max_qty,stock,eta_minutes,tags,featured,active,sort_order,rules,fields_schema) VALUES
('boost','Telegram Boost','بوست کانال با ثبت سفارش سریع و پیگیری وضعیت.','↗','boost',150000,180000,'تومان',1,100,-1,30,'پرفروش,سریع',1,1,1,'یوزرنیم یا لینک کانال را دقیق وارد کنید.','[{"key":"target","label":"لینک یا یوزرنیم کانال","type":"text","required":true}]'),
('premium','Telegram Premium','خرید اشتراک پرمیوم با توضیحات و شرایط شفاف.','✦','premium',980000,1100000,'تومان',1,1,-1,15,'محبوب',1,1,2,'قبل از سفارش، مدت و ریجن را بررسی کنید.','[{"key":"duration","label":"مدت اشتراک","type":"select","options":["1 ماه","3 ماه","12 ماه"],"required":true}]'),
('stars','Telegram Stars','خدمات مبتنی بر Stars برای خریدها و کاربردهای مجاز تلگرام.','★','stars',100000,110000,'تومان',50,5000,-1,10,'stars,جدید',0,1,3,'تعداد Stars را انتخاب کنید.','[{"key":"qty","label":"تعداد Stars","type":"number","required":true}]'),
('gift-rent','Gift Rent','اجاره گیفت برای ظاهر پروفایل با هزینه کمتر.','◇','gift',250000,300000,'تومان',1,30,-1,60,'خاص,اقتصادی',1,1,4,'مدت و نوع گیفت را در توضیحات سفارش مشخص کنید.','[{"key":"gift","label":"نوع گیفت","type":"text","required":true}]'),
('channel','Channel Services','خدمات مدیریت، آماده‌سازی و رشد کانال.','⌁','channel',450000,550000,'تومان',1,20,-1,120,'channel',0,1,5,'جزئیات مورد نیاز را در فرم سفارش وارد کنید.','[{"key":"brief","label":"توضیحات پروژه","type":"textarea","required":true}]');

INSERT OR IGNORE INTO market_items(id,name,number,discount,price,original_price,rarity,telegram_url,market_url,stock,featured,active,sort_order) VALUES
('gift-ice-101','Ice Cream',101,20,1250,1560,'Rare','https://t.me/','https://t.me/','1',1,1,1),
('gift-snoop-210','Snoop Dogg',210,15,2400,2820,'Legendary','https://t.me/','https://t.me/','1',1,1,2),
('gift-liberty-331','Liberty Figure',331,10,1890,2100,'Epic','https://t.me/','https://t.me/','1',0,1,3),
('gift-money-407','Money Pot',407,25,2950,3930,'Rare','https://t.me/','https://t.me/','2',1,1,4);

INSERT OR IGNORE INTO admins(id,name,username,role,active) VALUES
('admin_owner','Ali Zanjani','Zanjani_a','owner',1);
