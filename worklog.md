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

---
Task ID: hybrid-system
Agent: main
Task: بناء النظام الهجين الكامل: (1) تشريح عميق للملف بكشف رقم الصفحة المطبوع من الهوامش، (2) تصحيح تلقائي لرقم الصفحة، (3) اتصال سحابي بديل تلقائي عند عدم العثور على الاقتباس — يجلب المرجع الصحيح + التوثيق الجاهز APA/MLA.

Work Log:
- حسّنت findPagesByPrintedNumber في verify.ts: أصبحت تقرأ فقط أول سطرين وآخر سطرين من كل صفحة (الهوامش) وتكتشف الرقم المطبوع كرقم مستقل (تستبعد السنوات).
- أضفت extractPrintedPageNumber(pageText): تستخرج الرقم المطبوع من هوامش صفحة واحدة.
- أعدت كتابة verifyPageNumber: تبني خريطة physicalPage→printedPage من الهوامش، تحدد realPage (الرقم المطبوع في الكتاب) منفصلاً عن matchedPage (الفهرس الفعلي داخل الملف)، وتصحح الرقم تلقائياً عند wrong_page.
- أضفت حقل realPage إلى واجهة PageVerifyResult.
- بنيت findCitationOnWeb في library.ts: خط الدفاع الثاني. تبحث بالاقتباس بين علامتي اقتباس + اسم المؤلف في بحث الويب + Open Library، تسجّل النتائج، تستخرج رقم الصفحة من المقتطفات (extractPageFromSnippet: page X / p. X / ص X / صفحة X)، تركّب توثيق APA و MLA جاهز للنسخ.
- أضفت WebFallbackResult type (found, confidence, title, authors, year, publisher, isbn, page, pageConfirmed, url, sourceHits, apaCitation, mlaCitation, note).
- حدّثت verify-page route: عند status=not_found + وجود author، يستدعي findCitationOnWeb تلقائياً ويرفق النتيجة في result.fallback.
- حدّثت page.tsx: verifyPage يرسل author في الـ FormData.
- أضفت FallbackSection في citation-card.tsx: قسم بنفسجي مميز "المرجع البديل من المكتبة العالمية" يعرض العنوان/المؤلف/السنة/الناشر/الصفحة/ISBN/رابط المصدر + صندوقي APA و MLA مع أزرار نسخ + قائمة مصادر المكتبة.
- حدّثت PageVerifySection لعرض "الصفحة المطبوعة في الكتاب" منفصلة عن "الصفحة داخل الملف".
- lint نظيف (0 أخطاء).
- تحققت بـ curl: اقتباس Taleb الحقيقي غير موجود في الـ PDF → fallback وجد الاقتباس في LinkedIn/X بمقتطفات حرفية، confidence 65%.
- تحققت عبر Agent Browser: رفعت PDF على توثيق "لوديتش" باقتباس خارجي → الأداة أظهرت "لم يُعثر في الملف" ثم تلقائياً قسم "المرجع البديل من المكتبة العالمية — مرجع مقترح 50%" مع توثيق APA و MLA جاهزين للنسخ + أزرار النسخ + رابط المصدر + مصادر إضافية.

Stage Summary:
- النظام الهجين ثلاثي الطبقات شغّال بالكامل.
- الطبقة 1 (تشريح الملف): كشف الرقم المطبوع من الهوامش + التصحيح التلقائي.
- الطبقة 2 (التصحيح): عند wrong_page، يعرض realPage الصحيح المطبوع في الكتاب.
- الطبقة 3 (البديل العالمي): عند not_found، يطير بالاقتباس+المؤلف للمكتبات العالمية ويجلب المرجع + التوثيق الجاهز APA/MLA — الباحث لا يخرج أبداً بدون إجابة.
- ملفات محدّثة: src/lib/verify.ts, src/lib/library.ts, src/lib/types.ts, src/app/api/research/verify-page/route.ts, src/components/citation/citation-card.tsx, src/app/page.tsx.
