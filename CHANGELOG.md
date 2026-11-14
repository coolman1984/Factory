# سجل التغييرات

## 2026-11-14 — Material Flow Player V9

- Complete player on the new engine: all V8 tabs (INJ 1, INJ 2, EPS, Press) and 10 paths on the true CAD, both floors with elevator rides, the Factory Engine re-timing paths in the page (edit waits and speeds; save to master data), the V8 look, guided camera, minimap and video takes.
- Live in the Control Center (/v9) and as one offline HTML file (control/v9/build.mjs).
- All 10 paths clash-free (auto-route; elevator cores and devices handled); auto-route memory fixed (typed-array A*).

## 2026-11-14 — Real factory from AutoCAD

- E1-E2 imported from the Y26 AutoCAD layout in true metres: buildings, 9,540 wall/column/marking shapes, 414 objects (injection machines, SMT modules, EPS machines, cranes, racks, pallets, ...), stops and the INJ 1 paths (player plan registered onto the CAD, 96.6% line overlap).
- Engine timing of every path (path 1: 621 s, 212.9 m) and route clearance against the CAD (path 1 crosses 2 racks), saved in the database.
- 2D: CAD walls, objects, routes on the Control Center map. 3D: Godot 4.7 viewer (laptop preset) and film renderer with a directed camera; Blender procedural model library (18 models).

## 2026-11-13 — Factory Control Center

- Master data for every part of the factory (14 types), one SQLite database recording every change (with exact before/after), every command, every run with its events and serial numbers.
- Control UI: dashboard, master-data pages with in-place and bulk editing, record editor with where-used and safe rename, layout map with drag-to-move, runs with comparison, event browser and serial trace, change log with undo/redo, database page with read-only SQL, command palette; English, Arabic (right-to-left) and Korean.
- Agent interface: `control/fc.mjs` and a JSON API on the same checked commands; changes appear live in the open UI.
- Logical test dataset (handling teams added) and scenarios; 10 Control Center tests pass (including a headless-Chrome UI test).

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
