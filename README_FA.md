# Duck Store vNext — راهنمای فارسی کامل

این نسخه یک بازطراحی واقعی برای Mini App فروشگاه Duck Store است؛ فرانت‌اند، پنل ادمین، API، دیتابیس و ابزارهای Deploy از هم جدا شده‌اند.

## پوشه‌ها
```text
app/                  Mini App تلگرام
admin/                پنل مدیریت
worker/               Cloudflare Worker API
db/                   schema + seed برای D1
scripts/              build و ابزارها
.github/workflows/    اتوماسیون GitHub Actions
dist/                 خروجی نهایی Pages بعد از build
```

## امکانات پنل ادمین
- داشبورد و Analytics
- خدمات: افزودن، ویرایش، فعال/غیرفعال، قیمت، موجودی، دسته‌بندی، تخفیف، تگ، ترتیب
- مارکت: CRUD محصول
- سفارش‌ها: فیلتر و تغییر وضعیت و یادداشت
- کاربران و VIP
- کیف پول و Cashback
- کد تخفیف
- Referral
- تیکت پشتیبانی
- اعلان‌ها
- تنظیمات فروشگاه
- Audit Log

## معماری Cloudflare + GitHub
1. کد را روی GitHub قرار بده.
2. در Cloudflare Pages، Repository را وصل کن.
3. Build command را `npm run build` بگذار.
4. Output directory را `dist` بگذار.
5. با `npx wrangler d1 create duck-store` دیتابیس بساز.
6. ID دیتابیس را در `worker/wrangler.toml` قرار بده.
7. schema و seed را با Wrangler روی D1 اعمال کن.
8. Secretهای `BOT_TOKEN` و `ADMIN_KEY` را با Wrangler ثبت کن.
9. Worker را Deploy کن.
10. آدرس Worker را در `app/config.js` و `admin/config.js` قرار بده.
11. URL Pages را در BotFather به‌عنوان Mini App ثبت کن.

### دستورات اصلی
```bash
npm install
npm run build
npx wrangler d1 create duck-store
npx wrangler d1 execute duck-store --remote --file=./db/schema.sql
npx wrangler d1 execute duck-store --remote --file=./db/seed.sql
npx wrangler secret put BOT_TOKEN -c worker/wrangler.toml
npx wrangler secret put ADMIN_KEY -c worker/wrangler.toml
npx wrangler deploy -c worker/wrangler.toml
```

### امنیت
- `BOT_TOKEN` و `ADMIN_KEY` هرگز در GitHub قرار نگیرند.
- `initDataUnsafe` برای احراز هویت کافی نیست؛ Worker باید raw `initData` را اعتبارسنجی کند.
- برای Admin Session از توکن کوتاه‌عمر استفاده شده است.

### پرداخت Stars
برای کالا/خدمت دیجیتال در Telegram، Endpoint ایجاد invoice در Worker قرار گرفته و می‌تواند برای Telegram Stars تکمیل شود. برای پرداخت واقعی، باید `pre_checkout_query` و `successful_payment` را در webhook ربات پردازش کنید و سپس سفارش را قطعی کنید.

این پروژه زیرساخت و UI آن را آماده کرده است؛ اطلاعات Bot و fulfillment provider واقعی شما قابل اضافه‌کردن است.
