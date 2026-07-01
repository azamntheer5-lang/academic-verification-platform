# 🎓 منصة التحقق الأكاديمي الشاملة

> نظام أكاديمي متكامل للتحقق من المراجع وتوليدها — تطوير وإشراف **Azzam**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 🌟 نظرة عامة

منصة أكاديمية ذكية تتحقق من توثيقات البحث العلمي وتولّد مراجع حقيقية موثّقة 100%. تجمع بين المحرك الهجين (PDF + مكتبات عالمية) والمطابقة الدلالية المتقدمة مع معالجة لغوية عربية.

## ✨ الميزات الـ 14

### 🎯 التدقيق والتحقق
- **المحرك الهجين** — تشريح PDF + اتصال بالمكتبات العالمية (Google Books + Open Library + Crossref)
- **المطابقة الدلالية** — يفهم إعادة الصياغة (Paraphrasing) مع NLP عربي متقدم (stemming + stopwords)
- **التحقق عابر اللغات** — يترجم الاقتباس العربي تلقائياً للبحث في المصادر الإنجليزية
- **كاشف التناقض السياقي** — يحلل نية المؤلف الأصلي

### 🛡️ الأمان العلمي
- **مطهر الهلوسة الأكاديمية** — يكشف المراجع الوهمية المخترعة بواسطة LLMs
- **مولّد المراجع الذكي** — يولّد مراجع حقيقية لبحث بلا مصادر (صفر هلوسة — تحقق هيكلي صارم)
- **رادار الأوراق المسحوبة** — يفحص Retraction Watch + المجلات المفترسة
- **خريطة شبكة العلاقات** — يكتشف علماء أساسيين لم تذكرهم

### 🎨 التنسيق والإدارة
- **مهندس صيغ الجامعات** — APA 7 / MLA 9 / Chicago / Harvard / KSU / Cairo
- **كاشف التحيز الاستشهادي** — يوزان المراجع (حداثة + تنوع + تركيز)
- **الفحص التنبؤي للصفحات** — يحدد نطاق الصفحة من فهرس الكتاب
- **شهادة PDF احترافية** — تقرير موثّق للفحص مع علامة مائية
- **تصدير RIS/BibTeX** — استيراد مباشر في Zotero/EndNote/Mendeley

## 🏗️ البنية التقنية

```
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # 15+ API routes
│   │   ├── page.tsx            # الصفحة الرئيسية
│   │   └── layout.tsx          # RTL + خط Cairo
│   ├── components/             # مكونات الواجهة
│   │   ├── citation-verification-card.tsx  # البطاقة الرئيسية (3 تبويبات)
│   │   ├── citation/           # مكونات النظام المتقدم
│   │   └── ui/                 # shadcn/ui
│   ├── server/verify-engine/   # المحرك الخلفي المفصول
│   │   ├── service.ts          # orchestration
│   │   ├── pdf-extractor.ts    # تشريح PDF + NLP عربي
│   │   ├── library-fallback.ts # 3 طبقات بحث
│   │   ├── reference-generator.ts  # مولّد المراجع (صفر هلوسة)
│   │   ├── reference-verifier.ts    # تحقق هيكلي صارم
│   │   ├── batch-cleaner.ts    # مطهر الهلوسة
│   │   ├── formatters.ts       # 6 صيغ تنسيق
│   │   └── persistence.ts      # Prisma DB
│   └── lib/                    # أدوات مشتركة
├── prisma/schema.prisma        # قاعدة البيانات
├── mini-services/doc-extract/  # خدمة استخراج PDF (Bun)
├── backend/                    # مرجع FastAPI/Python
└── vercel.json                 # إعداد النشر
```

## 🚀 التشغيل المحلي

```bash
# تثبيت الاعتمادات
bun install

# تشغيل قاعدة البيانات
bun run db:push

# تشغيل خدمة استخراج PDF
cd mini-services/doc-extract && bun install && bun run dev &

# تشغيل المنصة
bun run dev
```

افتح `http://localhost:3000`

## 🔑 البيئة المطلوبة

- Node.js 18+ / Bun
- متغير `DATABASE_URL` (SQLite محلياً / PostgreSQL للإنتاج)
- `z-ai-web-dev-sdk` (مثبّت — يوفر LLM + web search)

## 📤 النشر على Vercel

1. اربط الـ repo بـ Vercel
2. أضف `DATABASE_URL` (Neon Postgres موصى به)
3. ارفع خدمة `doc-extract` على Railway منفصلاً
4. حدّث رابط الـ mini-service في `pdf-extractor.ts`

## 🎨 نظام الألوان

| العنصر | اللون | HEX |
|--------|-------|-----|
| الخلفية الليلية | `#0F1419` | midnight |
| الكحلي | `#1A2332` | navy |
| الذهبي البرتقالي | `#F5A623` | gold |
| الذهبي classic | `#D4AF37` | gold-classic |
| الكريمي | `#FAFAF9` | cream |

## 📄 الترخيص

MIT License — حر للاستخدام الأكاديمي والتعليمي.

---

<div align="center">

**تطوير وإشراف: Azzam** ✦

</div>
