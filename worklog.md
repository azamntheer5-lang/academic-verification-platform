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

---
Task ID: page-verify
Agent: main
Task: إضافة ميزة التحقق من رقم الصفحة برفع ملف المصدر (PDF أو Word) — لتجاوز قيد "المكتبات لا تعرض نص الصفحات".

Work Log:
- ثبّت pdf-parse@2.4.5 و mammoth@1.9.1 و pdf-lib@1.17.1.
- ولّدت PDF تجريبي (scripts/sample-source.pdf) و DOCX تجريبي (scripts/sample-source.docx) للاختبار.
- كتبت scripts/gen-sample-pdf.ts لتوليد PDF بأقتباسات على صفحات معروفة.
- واجهت مشكلة: pdfjs-dist لا يجد worker داخل تجميع Next.js (Turbopack يعيد كتابة الاستيرادات). الحل: نقل الاستخراج لـ mini-service منفصل.
- أنشأت mini-services/doc-extract (port 3004): خدمة HTTP تستقبل raw bytes + X-Kind header وترجع نص كل صفحة. تستخدم pdf-parse مع GlobalWorkerOptions.workerSrc مُعيّن لمسار الملف.
- أضفت verifyPageNumber() إلى src/lib/verify.ts: تبحث عن الاقتباس في كل الصفحات (bestWindowMatch)، تحدد الصفحة الفعلية، تصنّف النتيجة verified/wrong_page/not_found/no_quote، تُرجع المقطع المطابق + top candidates.
- بنيت POST /api/research/verify-page: يستقبل multipart/form-data (file + quote + claimedPage)، يرسل الملف لـ mini-service على localhost:3004/extract، ثم يطبّق verifyPageNumber محلياً.
- حدّثت CitationCard: حقل رفع بالسحب والإفلات (PDF/DOCX)، منطقة تعديل الاقتباس (Textarea)، عرض نتيجة الصفحة (شارة + قسم مفصّل: الصفحة المذكورة/الفعلية/نسبة التطابق/المقطع/أعلى الصفحات).
- حدّثت page.tsx: verifyPage() + editQuote() handlers، شارة "صفحات مؤكدة" في الإحصائيات، تحديث HowItWorks و InfoCard لشرح الميزة الجديدة.
- lint نظيف (0 أخطاء).
- تحققت عبر curl: PDF و DOCX كلاهما يرجع نتائج صحيحة (تطابق حرفي 100%، اكتشاف صفحة خاطئة).
- تحققت عبر Agent Browser: رفعت sample-source.pdf على توثيق "لوديتش · 2016" — الأداة أظهرت "الاقتباس موجود في الصفحة 3 لا 45، تطابق حرفي 100%" مع المقطع المطابق.

Stage Summary:
- الميزة شغّالة بالكامل للـ PDF و Word.
- mini-service doc-extract على port 3004 يعمل باستقلالية عن Next.js (يتفادى مشاكل تجميع pdfjs).
- API: POST /api/research/verify-page (multipart) → doc-extract:3004 → verifyPageNumber محلياً.
- النتيجة في الواجهة: شارة حالة الصفحة + قسم تفصيلي (الصفحة المذكورة vs الفعلية، نسبة التطابق، المقطع المطابق، قائمة أفضل الصفحات).
- ملفات جديدة: mini-services/doc-extract/{package.json,index.ts}, src/app/api/research/verify-page/route.ts, scripts/gen-sample-pdf.ts, scripts/sample-source.pdf, scripts/sample-source.docx.
- ملفات محدّثة: src/lib/verify.ts (verifyPageNumber), src/lib/types.ts (PageVerifyResult), src/components/citation/citation-card.tsx, src/app/page.tsx.
