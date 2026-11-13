# 🗺️ خريطة المستودع

## ١. الملفات الموجودة الآن

| المسار | المسؤولية |
|---|---|
| [README.md](../README.md) | نقطة الدخول وفهرس الخطة |
| [AGENTS.md](../AGENTS.md) | تعليمات الحفاظ على المعمارية أثناء العمل |
| [CHANGELOG.md](../CHANGELOG.md) | تاريخ ما أضيف فعليًا |
| [docs/00_MASTER_PLAN.md](00_MASTER_PLAN.md) | الهدف والمبادئ وحدود المشروع |
| [docs/01_SCOPE_AND_FACTORY_MODEL.md](01_SCOPE_AND_FACTORY_MODEL.md) | قطاعات المصنع والعناصر والعلاقات |
| [docs/02_ARCHITECTURE.md](02_ARCHITECTURE.md) | الوحدات وعقود الأوامر والأحداث والعرض |
| [docs/03_DATA_MODEL.md](03_DATA_MODEL.md) | الهويات والوحدات والمخزون والحفظ |
| [docs/04_PRODUCTION_AND_QUALITY.md](04_PRODUCTION_AND_QUALITY.md) | التشغيل والجودة والعمال والمؤشرات |
| [docs/05_LOGISTICS_AND_TRAFFIC.md](05_LOGISTICS_AND_TRAFFIC.md) | المهام والمناولة والتخزين والشحن |
| [docs/06_FACTORY_EDITOR.md](06_FACTORY_EDITOR.md) | أدوات التصميم وقواعد التغيير |
| [docs/07_VISUALS_AND_ASSETS.md](07_VISUALS_AND_ASSETS.md) | الأصول والإضاءة والحركة والأداء البصري |
| [docs/08_DATA_INTEGRATION.md](08_DATA_INTEGRATION.md) | الاستيراد والمصادر والتوقيت والتحقق |
| [docs/09_ROADMAP.md](09_ROADMAP.md) | مراحل التنفيذ وشروط الخروج |
| [docs/10_VALIDATION_AND_PERFORMANCE.md](10_VALIDATION_AND_PERFORMANCE.md) | حالات القبول وقياسات الأداء |
| [docs/11_DECISIONS_AND_OPEN_QUESTIONS.md](11_DECISIONS_AND_OPEN_QUESTIONS.md) | القرارات والافتراضات والمخاطر |
| [docs/12_REPOSITORY_MAP.md](12_REPOSITORY_MAP.md) | هذه الخريطة |
| [docs/13_IMPLEMENTATION_HANDOFF.md](13_IMPLEMENTATION_HANDOFF.md) | تعليمات بدء التنفيذ وتسليمه |
| [docs/14_REQUIREMENTS_TRACEABILITY.md](14_REQUIREMENTS_TRACEABILITY.md) | تغطية المتطلبات |
| [docs/15_SOURCES_AND_GLOSSARY.md](15_SOURCES_AND_GLOSSARY.md) | المصادر والمصطلحات |
| [docs/16_EXECUTION_PLAN.md](16_EXECUTION_PLAN.md) | حزم العمل المرتبة واختبارات قبولها |
| [examples/README.md](../examples/README.md) | حدود العينة وطريقة قراءتها |
| [examples/factory-blueprint.example.json](../examples/factory-blueprint.example.json) | تعريف مصنع افتراضي مترابط |
| [schemas/factory-blueprint.schema.json](../schemas/factory-blueprint.schema.json) | عقد بنيوي أولي للعينة |
| [docs/17_ENGINE_CORE.md](17_ENGINE_CORE.md) | Engine core: technology decision, API, model, events, status (English) |
| `engine/src/` | Engine modules: units, rng, queue, canon, ledger, routes, packing, journal, world, blueprint (no rendering) |
| `engine/cli.mjs`, `engine/build.mjs` | Command line (validate / run / resume) and browser bundle builder |
| `engine/test/`, `engine/scenarios/` | Acceptance tests and illustrative scenarios |
| [docs/18_CONTROL_CENTER.md](18_CONTROL_CENTER.md) | Factory Control Center: master data, database, control UI, agent interface, tests (English) |
| `control/` | Control Center: `schema.js` (master data registry), `store.js` (SQLite store, commands, runs), `seed.js`, `server.mjs` (UI + API), `fc.mjs` (command line), `ui/` (page, styles, languages), `test/` |
| `start-control-center.cmd` | Starts the Control Center and opens it in the browser |
| `material-flow/` | Material Flow player project (V8.3, the first viewer of the engine), merged with its own history; its own README, docs and tools. Company drawings, decks, private scenes and built players stay untracked (`material-flow/.gitignore`) |
| `package.json` | npm scripts only (`test`, `build`, `validate`, `demo`); no dependencies |

Section 2 below was the proposal before the engine existed; the built layout is `engine/` as listed above.

## ٢. بنية التنفيذ المستقبلية المقترحة

المسارات التالية **غير منشأة كبرنامج الآن**؛ يمكن تعديلها بعد اختيار التقنية.

| المسار المقترح | المسؤولية وحدود الاعتماد |
|---|---|
| `src/domain/` | أصناف ووصفات وهويات وقواعد؛ بلا مكتبة رسم |
| `src/simulation/` | الساعة والأحداث والعمليات والموارد |
| `src/inventory/` | العهدة والحجز والتتبع |
| `src/logistics/` | توزيع المهام والتحميل والتفريغ |
| `src/navigation/` | الشبكات والمسارات وقواعد المرور |
| `src/editor/` | الأوامر والتحقق والتراجع |
| `src/presentation/` | لقطات العرض والاختيار والموائمات |
| `src/render2d/` | العرض التخطيطي إذا احتاج مكونًا مستقلًا |
| `src/render3d/` | المجسمات والكاميرا والإضاءة والحركة |
| `src/persistence/` | حفظ ولقطات وسجل وترحيل |
| `src/integrations/` | موائمات مصادر البيانات |
| `src/analytics/` | المؤشرات والتجارب والمقارنة |
| `assets/` | أصول التشغيل مع بيانات مصدر وترخيص |
| `tests/` | حالات منطقية وتكامل وقبول |
| `benchmarks/` | سيناريوهات أداء قابلة للإعادة |
| `docs/decisions/` | قرارات مفصلة عند اتساع السجل |

الوحدات حدود مسؤولية؛ لا تعني خدمات مستقلة أو عمليات منفصلة بالضرورة.

## ٣. قاعدة الصيانة

إضافة ميزة تتطلب تحديث ملفها المختص، وشرط قبول في خطة الاختبار، وسطرًا في تغطية المتطلبات، وسجل قرار عند تغيير المعمارية. لا تنسخ نفس القاعدة في ملفات متعددة بصيغ متناقضة.
