# سجل التغييرات

## 2026-11-13 — Factory Engine 0.3.0

- Traffic zones (WP3.2): aisle sections and crossings with a capacity; a leg takes its lift car and zones all at once or waits
  holding nothing (deadlock-free). Blueprint scenario: one-lane aisles from edge width, named zones.
- Phase 4 core: serial numbers per unit (kept through assembly, test and packing), unit genealogy and `trace`, test stations
  with a seeded pass/fail draw and a repair loop, container packing plan and packing list.
- Layout journal: edits as patch commands with validator, exact undo/redo and a verifiable hash chain.
- About 10x faster long runs (event chain hash, finished missions trimmed). 16 tests pass.

## 2026-11-13 — Factory Engine 0.2.0

- `loop` policy: repeated trips of a fixed carrier (milk run / shift run) with trips, mean cycle and lift waits per policy.
- Optional seeded time spread on actions; zero spread draws nothing, so earlier results are unchanged.
- 11 tests pass. `.gitattributes` keeps LF line endings so the bundle hash is the same on every checkout.

## 2026-11-13 — Engine core built (Factory Engine 0.1.0)

- `engine/`: deterministic simulation core in plain JavaScript (no dependencies): integer ticks and quantities, named random
  streams, event queue, inventory ledger with reservations and invariants, route graph, command gateway, transport missions,
  stations with breakdowns, pull/push policies, snapshot/resume, fingerprint, frozen view, report.
- `engine/cli.mjs` validates and runs the sample blueprint; `engine/build.mjs` bundles `dist/factory-engine.js` for offline pages.
- 9 acceptance tests pass (`npm test`). Technology decision recorded (D14 closed, D17/D18 settled): see docs/17_ENGINE_CORE.md.
- First viewer: Material Flow Player V8.1 (local company project) plays every path from this engine.

## ٢٠٢٦-١١-١٢ — تأسيس حزمة التخطيط

- توثيق نطاق مصنع التليفزيونات ومختلف قطاعاته وحركاته.
- إضافة المعمارية وتنظيم البيانات والإنتاج والجودة والمناولة والمرور ومحرر التخطيط.
- إضافة خطة جودة الجرافيك، والتكامل مع بيانات المصنع، ومراحل التنفيذ والتحقق والأداء.
- تسجيل القرارات والأسئلة المفتوحة وخريطة المستودع وتعليمات تسليم التنفيذ وتغطية المتطلبات.
- إضافة عينة تعريف مصنع افتراضية ومخطط بنيوي لفحصها، دون تنفيذ محرك محاكاة.

## ٢٠٢٦-١١-١٢ — خطة التنفيذ التفصيلية

- إضافة تقسيم المراحل من صفر إلى الرابعة إلى حزم عمل مرتبة، لكل حزمة اختبار قبول.
- تسجيل قواعد هندسية مقترحة للزمن والكميات والعشوائية (D17) ومرشح تقنية أول للتقييم (D18)، دون اعتماد تقنية.
- ربط الخطة الجديدة بالفهرس وخريطة المستودع وتسليم التنفيذ وتغطية المتطلبات.

هذه نسخة تخطيط أولية. لا يوجد إصدار تطبيق أو نتائج تشغيل مصنع حقيقي.
