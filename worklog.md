---
Task ID: master
Agent: main
Task: بناء أداة توثيق مراجع أكاديمية للباحثين — تستخرج التوثيقات من نص البحث بالذكاء الاصطناعي، وتتحقق منها في المكتبات الإلكترونية الحقيقية (Open Library + بحث الويب) للتأكد من اسم المؤلف وسنة النشر.

Work Log:
- قرأت وثائق مهارة LLM و web-search من z-ai-web-dev-sdk.
- ثبّت pdf-parse@2.4.5 لاستخراج نص PDF (للاستخدام المستقبلي في التحقق من رقم الصفحة).
- صمّمت مخطط Prisma (Source / Page / Citation) ودفعتته لقاعدة SQLite.
- كتبت src/lib/citation.ts لتنسيق التوثيق بأربع صيغ (APA 7 / MLA 9 / Chicago / Harvard) بدعم عربي RTL.
- كتبت src/lib/verify.ts لمطابقة النص (تطبيع عربي + تشابه Jaccard + نافذة منزلقة).
- كتبت src/lib/library.ts: يبحث في Open Library Search API + z-ai web_search، ويقارن المؤلف/العنوان/السنة ويصنّف النتيجة (verified / author_mismatch / not_found / partial).
- كتبت src/lib/research.ts: يستخدم LLM لاستخراج مصفوفة JSON من التوثيقات (مؤلف/سنة/عنوان/صفحة/اقتباس/سياق) من نص البحث.
- بنيت API routes: POST /api/research/extract, POST /api/research/verify, GET/POST /api/sources, DELETE /api/sources/[id].
- بنيت الواجهة الأمامية RTL بـ Tailwind + shadcn/ui: textarea للبحث، استخراج، قائمة بطاقات توثيق مع أزرار تحقق/حفظ، لوحة مكتبة جانبية، شارات حالة، إحصائيات.
- أضفت خط Amiri العربي للطابع الأكاديمي.
- lint نظيف (0 أخطاء). dev server على المنفذ 3000 يعمل بدون أخطاء.
- تحققت عبر Agent Browser: الصفحة تُعرض RTL، النص النموذجي يتعبأ، الاستخراج ينتج 4 توثيقات، التحقق يبحث في المكتبات ويعرض نتائج حقيقية (archive.org، jarir.com، Google Books)، الحفظ يكتب في DB ولوحة المكتبة تظهر العدد.

Stage Summary:
- الأداة شغّالة بالكامل من الواجهة إلى DB.
- التحقق من رقم الصفحة يتطلب رفع ملف المصدر (PDF) — مذكور بوضوح في الواجهة لأن المكتبات الإلكترونية لا تعرض نص الصفحات.
- النتائج: 4 استدعاءات POST /api/research/verify كلها 200 (4.5s–11s لكل توثيق)، POST /api/research/extract 200 في 5s.
- قاعدة البيانات تحتوي على 4 مصادر محفوظة كدليل على عمل الحفظ.
- مخرجات: src/app/page.tsx, src/components/citation/*, src/lib/{citation,verify,library,research,types}.ts, src/app/api/research/*, src/app/api/sources/*, prisma/schema.prisma.
