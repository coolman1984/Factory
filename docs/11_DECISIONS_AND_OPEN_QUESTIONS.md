# 🧭 القرارات والافتراضات والأسئلة المفتوحة

«أساس الخطة» يعني أنه قرار تنظيمي مستخدم في هذه الوثائق، وليس دليلًا على تنفيذ أو اعتماد صناعي. أي تغيير يسجل هنا مع السبب والأثر.

## ١. سجل القرارات

| المعرف | القرار | الحالة | السبب |
|---|---|---|---|
| D01 | استقلال المحاكاة عن الرسم | أساس الخطة | صحة النتائج مع اختلاف العرض |
| D02 | مصدر حالة تشغيل واحد | أساس الخطة | منع التضارب والازدواج |
| D03 | فصل الإدارة والتركيب والتكليف والاحتواء | أساس الخطة | تنظيم صحيح للمتحركات والثوابت |
| D04 | أحداث إنتاج مع حركة مستمرة مستقلة | أساس الخطة | دقة وكفاءة دون ربط بالإطارات |
| D05 | تعريف وحالة وتاريخ منفصلة | أساس الخطة | إعادة تشغيل ومراجعة وترحيل |
| D06 | نسخ تخطيط وأوامر متحققة | أساس الخطة | تعديل وتراجع دون إفساد العمل الجاري |
| D07 | تتبع بالوحدة أو الدفعة أو الكمية | أساس الخطة | دقة تناسب الغرض والحجم |
| D08 | سجل نقل وحجوزات ومهام ذات معرفات | أساس الخطة | عدم تكرار المواد والطلبات |
| D09 | شبكة عملية تسمح بالإصلاح | أساس الخطة | تمثيل التشغيل الواقعي |
| D10 | طبقة مرور مستقلة عن إيجاد الطريق | أساس الخطة | إدارة تقاطعات وانتظار وتعطل |
| D11 | محرك رسم قائم قابل للاستبدال | اتجاه مقترح | تركيز التطوير على المصنع |
| D12 | كاتب منطقي واحد مبدئيًا | اتجاه مقترح | تقليل تعقيد الاتساق |
| D13 | دعم محلي والعمل دون اتصال | هدف للتقييم | ملاءمة بيئة المصنع |
| D14 | اختيار اللغة والمكتبات بعد تجربة | مؤجل عمدًا | الجهاز والقيود لم تُقَس بعد |
| D15 | بروتوكولات ومخزن بيانات التنفيذ | مؤجل عمدًا | يتحدد حسب حجم التشغيل والتوزيع |
| D16 | حدود الأداء ومستويات الدقة | تحتاج قياسًا | لا ضمانات من تقديرات أولية |
| D17 | زمن وكميات بأعداد صحيحة، وعشوائية مسماة ببذور، وبصمة حالة للمقارنة | اتجاه مقترح | نتائج متطابقة بين التشغيلات والأجهزة؛ يثبت في أول حزمة تستخدمه |
| D18 | نواة TypeScript مع مكتبة رسم ويب قائمة كمرشح أول في تجربة المقارنة | مرشح للتقييم | فصل النواة بأقل تكلفة صيانة؛ لا يلغي D14 قبل القياس على الجهاز |

تفاصيل D17 و D18 وبدائلهما في [خطة التنفيذ التفصيلية](16_EXECUTION_PLAN.md).

### Decisions of 2026-11-13 (owner approved the technology; details in [17_ENGINE_CORE.md](17_ENGINE_CORE.md))

| ID | Decision | Status | Reason |
|---|---|---|---|
| D14 | Plain modern JavaScript (ES modules, no build step for the core), three.js for rendering, one offline HTML page as the product form | decided | owner agreed after comparing with Unity, Unreal, Godot, Babylon.js, commercial simulators; runs on the target PC with no installs |
| D17 | Integer ticks with the tick length declared per model (default 1 ms; 1 µs for the V8 bridge); integer base quantities; named seeded streams; state fingerprint | built | determinism and resume proved by tests V24 and V16 |
| D18 | Superseded by D14: TypeScript dropped (needs an npm build step), the core stays renderer-free | closed | same separation, no installs |
| D19 | Material Flow V8 (the owner's existing three.js player) is the first viewer; it takes its step times from engine events through one bridge, its graphics unchanged | built | owner: reuse the V8 graphics on the new engine; bit-identical replay keeps V8's tests valid |
| D20 | The engine bundle is copied (vendored) into a viewer project; company layouts never enter this repository | built | this repository has a GitHub remote; the company project is local only |
| D21 | Traffic (WP3.2): a leg takes its lift car and every traffic zone it crosses all at once or waits holding none, so waits cannot form a cycle (deadlock-free by construction); viewers split legs per zone | built (0.3.0) | no deadlock detector needed while nothing is held during a wait; revisit if a trolley must hold a zone while waiting |
| D22 | Layout edits go through a journal of patch commands (exact inverse, validator, append-only hash chain); a viewer edit that adds a problem is refused and rolled back | built (0.3.0) | the owner asked that every change be checked and undoable at engine level |
| D27 | Material-Flow is merged into this repository as `material-flow/` with its history (`git subtree`); its untracked company inputs (`private/`, `dist/`, decks, drawings) stay local. Supersedes the "local only" part of D20 | done 2026-11-13 | owner chose this repository and confirmed it is private; sync with `git subtree pull --prefix=material-flow material-flow main` |
| D24 | Control Center data lives in one local SQLite file through Node's built-in `node:sqlite`; master data records are the blueprint's own JSON objects | built | no installs on the target PC; the assembled blueprint stays the engine's input format |
| D25 | Every master-data write is a checked command: refused if it adds a problem (unless forced), recorded with exact before/after; undo/redo replay the record | built | the owner and the agent must be able to change anything quickly without silently breaking the data |
| D26 | UI languages through a dictionary applied to rendered text (English source; Arabic right-to-left; Korean); record data never translated | built | one code path for three languages; a test checks that every label has both translations |
| D23 | The event hash chain hashes each event as emitted (field order fixed by the engine code) instead of sorted keys; finished missions drop their action list | built (0.3.0) | long shift runs became about 10x faster with the same determinism |

## ٢. الافتراضات المعلنة

- المشروع يمثل مصنع تليفزيونات قابلًا للتوسع، وليس مخططًا مطابقًا لموقع قائم حتى الآن.
- قطاع مستقل قد يدمج مع قطاع آخر في مصنع فعلي؛ المحرك لا يفرض سبعة أقسام ثابتة.
- مكونات ووصفات وأرقام العينة خيالية مبسطة، ولا تصلح لتخطيط الإنتاج الحقيقي.
- عينات الحركة في البداية محسوبة؛ بيانات التتبع الحقيقية غير متاحة في هذه الحزمة.
- مؤشرات المخزون والجودة والتكلفة تحتاج تعريفًا يتفق عليه صاحب العملية قبل استخدامها لاتخاذ قرار فعلي.

## ٣. معلومات مطلوبة عند بدء التنفيذ

| السؤال | أثره | متى يلزم |
|---|---|---|
| ما مواصفات جهاز التشغيل والشاشة؟ | اختيار الرسم وميزانيات الأداء | المرحلة صفر |
| هل التشغيل فردي أم متعدد المستخدمين؟ | الحفظ والتزامن والصلاحيات | المرحلة صفر |
| هل يلزم متصفح أم تطبيق سطح مكتب؟ | التوزيع والتكامل المحلي | المرحلة صفر |
| ما قيود الشبكة والتثبيت والملفات؟ | اختيار المكونات وموائمات البيانات | المرحلة صفر |
| هل يوجد مخطط بمقياس ومواقع معدات؟ | بناء التخطيط ومعايرة الحركة | قبل نموذج مصنع فعلي |
| كم خطًا وعاملًا ووسيلة ووحدة مادة متتبعة؟ | حدود الحجم ومستوى التفاصيل | قبل قياس الحجم |
| ما الموديلات والوصفات وطرق التشغيل؟ | صحة الاستهلاك والتوافق | قبل محاكاة الإنتاج الحقيقي |
| ما أزمنة التشغيل والتجهيز والأعطال؟ | دقة التجارب | قبل المعايرة |
| ما قواعد المرور والتحميل والتخزين؟ | حركة ممكنة وقيود سليمة | قبل اختبار المناولة الواقعية |
| ما مصادر الأحداث والمواقع وتكرارها؟ | حد التحديث وجودة التوأم | قبل الربط |
| ما القرارات المطلوب دعمها أولًا؟ | ترتيب المؤشرات والتجارب | قبل توسيع النطاق |

هذه قائمة تجهيز، وليست طلب تأكيد يمنع حفظ الخطط الحالية.

## ٤. المخاطر ومعالجتها

| الخطر | المعالجة |
|---|---|
| بناء مصنع واسع قبل صحة المنطق | دورة صغيرة كاملة وشروط خروج |
| صور جميلة تعطي ثقة زائدة | أدلة أحداث ومخزون ومعايرة مستقلة |
| ملف ضخم يصعب تغييره | فصل العقود والإصدارات والحالة |
| تضخم التفاصيل والذاكرة | تتبع مناسب للغرض وتفاصيل بصرية متدرجة |
| تغيير تخطيط يكسر المهام | أوامر متسقة وإبطال مخابئ وتحقق وصول |
| بيانات متأخرة أو متعارضة | مصدر وتوقيت وسياسة تسوية |
| اختلاف جودة الأصول | عقد أصل ومشهد معايرة وفحص ترخيص |
| اختيار تقنية لا تعمل محليًا | تجربة مبكرة على الجهاز الفعلي |

## ٥. قالب قرار جديد

التاريخ؛ المعرف؛ المشكلة؛ الخيارات؛ القرار؛ الأسباب؛ القيود؛ أدلة التحقق؛ الملفات المتأثرة؛ وطريقة التراجع أو الترحيل.
