// UI languages of the Control Center: English (source), Arabic (right to left) and Korean.
// The app renders English; a MutationObserver translates every new text node and the placeholder/title/aria-label attributes
// through this dictionary (exact phrases) and the patterns below (phrases with numbers or names). Record data (ids, names,
// values typed by people) is never translated; technical messages from the engine stay in English inside a translated frame.
export const LANGS = { en: { name: "English", dir: "ltr" }, ar: { name: "العربية", dir: "rtl" }, ko: { name: "한국어", dir: "ltr" } };

// "English": ["Arabic", "Korean"]
export const D = {
  // header, navigation
  "Factory Control Center": ["مركز التحكم في المصنع", "공장 제어 센터"], "Search or type a command...": ["ابحث أو اكتب أمرًا...", "검색하거나 명령을 입력하세요..."],
  "Find anything, run commands (Ctrl+K or /)": ["ابحث عن أي شيء أو نفّذ أوامر (Ctrl+K أو /)", "무엇이든 찾고 명령 실행 (Ctrl+K 또는 /)"], "Master data revision": ["إصدار البيانات الأساسية", "마스터 데이터 리비전"],
  "Validation status": ["حالة التحقق", "검증 상태"], "Undo (Ctrl+Z)": ["تراجع (Ctrl+Z)", "실행 취소 (Ctrl+Z)"], "Redo (Ctrl+Y)": ["إعادة (Ctrl+Y)", "다시 실행 (Ctrl+Y)"], "Run a simulation": ["تشغيل محاكاة", "시뮬레이션 실행"],
  "↶ Undo": ["↶ تراجع", "↶ 실행 취소"], "↷ Redo": ["↷ إعادة", "↷ 다시 실행"], "▶ Run": ["▶ تشغيل", "▶ 실행"], "No problems": ["لا توجد مشكلات", "문제 없음"], "Language": ["اللغة", "언어"],
  "Overview": ["نظرة عامة", "개요"], "Dashboard": ["لوحة المتابعة", "대시보드"], "Layout map": ["خريطة المخطط", "배치도"], "Records": ["السجلات", "기록"], "Runs": ["التشغيلات", "실행 기록"],
  "Change log": ["سجل التغييرات", "변경 이력"], "Database": ["قاعدة البيانات", "데이터베이스"], "has problems": ["به مشكلات", "문제 있음"], "Sections": ["الأقسام", "섹션"], "Record editor": ["محرر السجل", "레코드 편집기"],
  // groups and master data types
  "Site": ["الموقع", "부지"], "Products": ["المنتجات", "제품"], "Layout": ["المخطط", "배치"], "Navigation": ["الممرات", "통로망"], "Production": ["الإنتاج", "생산"], "Logistics": ["المناولة", "물류"], "Stock": ["المخزون", "재고"], "Scenarios": ["السيناريوهات", "시나리오"],
  "Factory": ["المصنع", "공장"], "Items": ["الأصناف", "품목"], "Prefabs": ["النماذج الجاهزة", "프리팹"], "Entities": ["الكيانات", "개체"], "Ports": ["المنافذ", "포트"], "Nav nodes": ["نقاط الممرات", "통로 노드"], "Aisles": ["الممرات", "통로"],
  "Processes": ["العمليات", "공정"], "Material flows": ["تدفقات المواد", "자재 흐름"], "Handling teams": ["فرق المناولة", "운반 팀"], "Replenishment": ["إعادة التزويد", "보충"], "Initial stock": ["المخزون الابتدائي", "초기 재고"], "Shipping": ["الشحن", "출하"],
  // type help texts
  "The site: name, units, axes and size. Units must stay m, s, kg.": ["الموقع: الاسم والوحدات والمحاور والأبعاد. يجب أن تبقى الوحدات m وs وkg.", "부지: 이름, 단위, 축, 크기. 단위는 m, s, kg 이어야 합니다."],
  "Materials, parts and products. Serial items (ea only) get one number per unit.": ["الخامات والأجزاء والمنتجات. الأصناف المسلسلة (ea فقط) تأخذ رقمًا لكل وحدة.", "자재, 부품, 제품. 시리얼 품목(ea 전용)은 단위마다 번호를 받습니다."],
  "Reusable object types (size, category). Entities name a prefab and its version.": ["أنواع عناصر قابلة لإعادة الاستخدام (الحجم والفئة). يسمّي كل كيان نموذجه وإصداره.", "재사용 가능한 객체 유형(크기, 범주). 개체는 프리팹과 버전을 지정합니다."],
  "Everything placed in the factory: zones, lines, stations, stores, containers, trolleys, workers. Position is relative to the spatial parent.": ["كل ما يوضع في المصنع: مناطق وخطوط ومحطات ومخازن وحاويات وعربات وعمال. الموضع منسوب إلى الأب المكاني.", "공장에 배치된 모든 것: 구역, 라인, 스테이션, 창고, 컨테이너, 대차, 작업자. 위치는 공간상 부모 기준입니다."],
  "Where material enters or leaves a store: linked to a navigation node and the items it accepts.": ["مكان دخول المواد إلى المخزن أو خروجها منه: مرتبط بنقطة ممر وبالأصناف التي يقبلها.", "자재가 창고에 들어오거나 나가는 지점: 통로 노드와 허용 품목에 연결됩니다."],
  "Points of the aisle network (world coordinates, m).": ["نقاط شبكة الممرات (إحداثيات عامة بالمتر).", "통로망의 지점(월드 좌표, m)."],
  "Aisle segments between nodes: width, speed limit, who may use them. Narrow aisles can become one-lane traffic zones (scenario).": ["مقاطع الممرات بين النقاط: العرض وحد السرعة ومن يستخدمها. يمكن أن تصبح الممرات الضيقة مناطق مرور بحارة واحدة (في السيناريو).", "노드 사이 통로 구간: 폭, 제한 속도, 사용 주체. 좁은 통로는 단일 차로 교통 구역이 될 수 있습니다(시나리오)."],
  "What a station makes: inputs from its input store, outputs to its output store, cycle time and parallel slots.": ["ما تنتجه المحطة: مدخلات من مخزن الإدخال ومخرجات إلى مخزن الإخراج وزمن الدورة والخانات المتوازية.", "스테이션이 만드는 것: 입력 창고의 투입물, 출력 창고로의 산출물, 사이클 타임, 병렬 슬롯."],
  "Which item moves from which port to which port, and who moves it.": ["أي صنف يتحرك من أي منفذ إلى أي منفذ، ومن ينقله.", "어떤 품목이 어느 포트에서 어느 포트로 이동하고 누가 운반하는지."],
  "Trolleys and workers that serve a set of flows.": ["العربات والعمال الذين يخدمون مجموعة من التدفقات.", "일련의 흐름을 담당하는 대차와 작업자."],
  "Pull levels for an item at a store (overrides the scenario's default levels).": ["مستويات السحب لصنف في مخزن (تتجاوز المستويات الافتراضية في السيناريو).", "창고 내 품목의 풀 수준(시나리오 기본값보다 우선)."],
  "Handling units present at the start of a run.": ["وحدات المناولة الموجودة عند بداية التشغيل.", "실행 시작 시점에 있는 운반 단위."],
  "The shipping container: inner size and payload, used by the packing plan.": ["حاوية الشحن: المقاس الداخلي والحمولة، وتُستخدم في خطة التعبئة.", "출하 컨테이너: 내부 크기와 적재 하중, 적재 계획에 사용됩니다."],
  "Run settings: horizon, seed, speeds, handling times, pull/push rules, breakdowns, quality, traffic and shipping. One blueprint, many experiments.": ["إعدادات التشغيل: المدة والبذرة والسرعات وأزمنة المناولة وقواعد السحب والدفع والأعطال والجودة والمرور والشحن. مخطط واحد لتجارب كثيرة.", "실행 설정: 기간, 시드, 속도, 운반 시간, 풀/푸시 규칙, 고장, 품질, 교통, 출하. 하나의 청사진으로 여러 실험."],
  // field labels
  "Accepted item ids": ["الأصناف المقبولة", "허용 품목"], "Allowed modes": ["الأنماط المسموحة", "허용 이동 방식"], "Axes": ["المحاور", "좌표축"], "Bidirectional": ["في الاتجاهين", "양방향"], "Blueprint random seed": ["بذرة المخطط العشوائية", "청사진 난수 시드"],
  "Breakdowns": ["الأعطال", "고장"], "Capabilities": ["القدرات", "기능"], "Capacity": ["السعة", "용량"], "Carton size (m)": ["مقاس الكرتونة (م)", "카톤 크기 (m)"], "Category": ["الفئة", "범주"], "Closed edges": ["الممرات المغلقة", "폐쇄 통로"],
  "Container entity ID": ["الحاوية", "컨테이너 개체 ID"], "Contents": ["المحتويات", "내용물"], "Count confirmed inbound": ["احتساب الوارد المؤكد", "확정 입고 포함"], "Cycle (s)": ["الدورة (ث)", "사이클 (초)"], "Destination entity ID": ["الوجهة", "도착지 개체 ID"],
  "Destination port ID": ["منفذ الوجهة", "도착 포트 ID"], "Edge ID": ["معرّف الممر", "통로 ID"], "Entity ID": ["معرّف الكيان", "개체 ID"], "Factory ID": ["معرّف المصنع", "공장 ID"], "Failure policy": ["سياسة الأعطال", "고장 정책"], "Flow ID": ["معرّف التدفق", "흐름 ID"],
  "From node": ["من نقطة", "시작 노드"], "From port ID": ["من منفذ", "출발 포트 ID"], "Handling policy ID": ["فريق المناولة", "운반 팀 ID"], "Handling unit ID": ["معرّف وحدة المناولة", "운반 단위 ID"], "Horizon h": ["المدة (ساعة)", "기간 (시간)"], "ID": ["المعرّف", "ID"],
  "Inner size (m)": ["المقاس الداخلي (م)", "내부 크기 (m)"], "Input location ID": ["مخزن الإدخال", "입력 위치 ID"], "Inputs": ["المدخلات", "투입물"], "Item ID": ["الصنف", "품목 ID"], "Length unit": ["وحدة الطول", "길이 단위"], "Load s": ["زمن التحميل (ث)", "적재 시간 (초)"],
  "Local position m": ["الموضع المحلي (م)", "로컬 위치 (m)"], "Location entity ID": ["المكان", "위치 개체 ID"], "Lot ID": ["رقم الدفعة", "로트 ID"], "Mass unit": ["وحدة الكتلة", "질량 단위"], "Max handling units per trip": ["أقصى وحدات مناولة للرحلة", "운반당 최대 단위"],
  "Max payload kg": ["أقصى حمولة (كجم)", "최대 적재 하중 (kg)"], "Mtbf s": ["متوسط الزمن بين الأعطال (ث)", "평균 고장 간격 (초)"], "Mttr s": ["متوسط زمن الإصلاح (ث)", "평균 수리 시간 (초)"], "Name": ["الاسم", "이름"], "Navigation node ID": ["نقطة الممر", "통로 노드 ID"],
  "Node ID": ["معرّف النقطة", "노드 ID"], "Note": ["ملاحظة", "메모"], "Notes": ["ملاحظات", "메모"], "One-lane below (m)": ["حارة واحدة تحت (م)", "단일 차로 기준 폭 미만 (m)"], "Organisation parent": ["الأب الإداري", "조직상 상위"], "Origin": ["نقطة الأصل", "원점"],
  "Output location ID": ["مخزن الإخراج", "출력 위치 ID"], "Outputs": ["المخرجات", "산출물"], "Owner entity ID": ["المالك", "소유 개체 ID"], "Packing plan status": ["حالة خطة التعبئة", "적재 계획 상태"], "Parallel slots": ["خانات متوازية", "병렬 슬롯"], "Pass rate": ["نسبة النجاح", "합격률"],
  "Policy ID": ["معرّف السياسة", "정책 ID"], "Port ID": ["معرّف المنفذ", "포트 ID"], "Position (m)": ["الموضع (م)", "위치 (m)"], "Position m": ["الموضع (م)", "위치 (m)"], "Prefab ID": ["النموذج الجاهز", "프리팹 ID"], "Prefab version": ["إصدار النموذج", "프리팹 버전"], "Process": ["العملية", "공정"],
  "Process ID": ["معرّف العملية", "공정 ID"], "Pull reorder cycles": ["دورات نقطة إعادة الطلب", "풀 재주문 사이클"], "Pull target cycles": ["دورات المستوى المستهدف", "풀 목표 사이클"], "Push lot": ["دفعة الدفع", "푸시 로트"], "Quality": ["الجودة", "품질"], "Quality policy": ["سياسة الجودة", "품질 정책"],
  "Quantity": ["الكمية", "수량"], "Reorder point": ["نقطة إعادة الطلب", "재주문점"], "Repair s": ["زمن الإصلاح (ث)", "수리 시간 (초)"], "Repair slots": ["خانات الإصلاح", "수리 슬롯"], "Required capabilities": ["القدرات المطلوبة", "필요 기능"], "Role": ["الدور", "역할"],
  "Sample data only": ["بيانات عينة فقط", "샘플 데이터 전용"], "Schema version": ["إصدار المخطط", "스키마 버전"], "Seed": ["البذرة", "시드"], "Serial prefix": ["بادئة الرقم التسلسلي", "시리얼 접두어"], "Shipping allow tipping": ["السماح بإمالة الكرتونة", "카톤 눕힘 허용"],
  "Shipping carton kg": ["وزن الكرتونة (كجم)", "카톤 무게 (kg)"], "Site size (m)": ["أبعاد الموقع (م)", "부지 크기 (m)"], "Size (m)": ["المقاس (م)", "크기 (m)"], "Slot size ea": ["سعة الخانة (قطعة)", "슬롯 크기 (ea)"], "Slot size kg": ["سعة الخانة (كجم)", "슬롯 크기 (kg)"],
  "Snap step m": ["خطوة المحاذاة (م)", "스냅 간격 (m)"], "Source port ID": ["منفذ المصدر", "출발 포트 ID"], "Spatial parent": ["الأب المكاني", "공간상 상위"], "Speed limit mps": ["حد السرعة (م/ث)", "제한 속도 (m/s)"], "Station entity ID": ["المحطة", "스테이션 개체 ID"],
  "Storage slots": ["خانات التخزين", "보관 슬롯"], "Target level": ["المستوى المستهدف", "목표 수준"], "Tick per second": ["نبضات في الثانية", "초당 틱"], "Time unit": ["وحدة الزمن", "시간 단위"], "To node": ["إلى نقطة", "도착 노드"], "To port ID": ["إلى منفذ", "도착 포트 ID"],
  "Tracking": ["التتبع", "추적 방식"], "Transporter entity ids": ["العربات", "대차"], "Trolley speed mps": ["سرعة العربة (م/ث)", "대차 속도 (m/s)"], "Unit": ["الوحدة", "단위"], "Unload s": ["زمن التفريغ (ث)", "하역 시간 (초)"], "Version": ["الإصدار", "버전"],
  "Visual asset": ["الأصل المرئي", "시각 자산"], "Walk speed mps": ["سرعة المشي (م/ث)", "보행 속도 (m/s)"], "Width m": ["العرض (م)", "폭 (m)"], "Worker entity ids": ["العمال", "작업자"], "Yaw (deg)": ["الدوران (درجة)", "회전 (도)"],
  // option values shown in lists
  "site": ["موقع", "부지"], "zone": ["منطقة", "구역"], "line": ["خط", "라인"], "station": ["محطة", "스테이션"], "storage": ["مخزن", "창고"], "container": ["حاوية", "컨테이너"], "transporter": ["عربة نقل", "대차"], "worker": ["عامل", "작업자"],
  "quantity": ["بالكمية", "수량"], "lot": ["بالدفعة", "로트"], "serial": ["تسلسلي", "시리얼"], "material_in": ["إدخال مواد", "자재 입고"], "material_out": ["إخراج مواد", "자재 출고"], "pedestrian": ["مشاة", "보행"], "manual_trolley": ["عربة يدوية", "수동 대차"],
  "yes": ["نعم", "예"], "no": ["لا", "아니요"],
  // real factory: CAD layers, stops, trolley paths, 3D and film
  "Routes": ["المسارات", "경로"], "Size of this object (m)": ["مقاس هذا العنصر (م)", "이 개체의 크기 (m)"], "3D model (GLB)": ["النموذج ثلاثي الأبعاد (GLB)", "3D 모델 (GLB)"], "Source (CAD layer / block)": ["المصدر (طبقة / بلوك أوتوكاد)", "출처 (CAD 레이어 / 블록)"],
  "CAD layers": ["طبقات أوتوكاد", "CAD 레이어"], "Building geometry imported from AutoCAD in true metres (site frame): walls, partitions and columns as line segments or rectangles. The 2D map and the 3D viewer draw these.": ["هندسة المبنى المستوردة من أوتوكاد بالأمتار الحقيقية: الجدران والقواطع والأعمدة كخطوط أو مستطيلات. ترسمها الخريطة ثنائية الأبعاد والعرض ثلاثي الأبعاد.", "AutoCAD에서 실제 미터 단위로 가져온 건물 형상: 벽, 칸막이, 기둥을 선분 또는 사각형으로 저장합니다. 2D 지도와 3D 뷰어가 이를 그립니다."],
  "Layer ID": ["معرّف الطبقة", "레이어 ID"], "Label": ["التسمية", "표시 이름"], "exterior_wall": ["جدار خارجي", "외벽"], "wall": ["جدار", "벽"], "partition": ["قاطع", "칸막이"], "column": ["عمود", "기둥"], "marking": ["علامة أرضية", "바닥 표시"], "outline": ["مخطط", "외곽선"],
  "Height m": ["الارتفاع (م)", "높이 (m)"], "Thickness m": ["السُمك (م)", "두께 (m)"], "Color": ["اللون", "색상"], "CAD source layers": ["طبقات المصدر في أوتوكاد", "CAD 원본 레이어"], "Shapes": ["الأشكال", "도형"],
  "Segments [x1,y1,x2,y2] or rectangles [x,y,w,d,yaw] (m)": ["خطوط [x1,y1,x2,y2] أو مستطيلات [x,y,w,d,yaw] (م)", "선분 [x1,y1,x2,y2] 또는 사각형 [x,y,w,d,yaw] (m)"],
  "Stops": ["نقاط التوقف", "정차 지점"], "Points a trolley visits (scan PCs, gates, warehouses, lines), in true metres of the site frame.": ["النقاط التي تزورها العربة (أجهزة المسح والبوابات والمخازن والخطوط) بالأمتار الحقيقية.", "대차가 방문하는 지점(스캔 PC, 게이트, 창고, 라인), 실제 미터 좌표."],
  "Stop ID": ["معرّف نقطة التوقف", "정차 지점 ID"], "Symbol": ["الرمز", "기호"], "result": ["نتيجة", "실적"], "mapping": ["ربط", "매핑"], "area": ["منطقة", "구역"], "scan": ["مسح", "스캔"], "gate": ["بوابة", "게이트"], "dest": ["وجهة", "목적지"],
  "Floor": ["الطابق", "층"], "Device at the stop": ["الجهاز عند نقطة التوقف", "정차 지점의 장치"], "Trolley paths": ["مسارات العربات", "대차 경로"],
  "A trolley trip: ordered steps (stop, mode, wait) and the drawn route of each step in true metres. The engine times the trip; the 3D film follows it.": ["رحلة عربة: خطوات مرتبة (نقطة التوقف والنمط والانتظار) والمسار المرسوم لكل خطوة بالأمتار الحقيقية. المحرك يحسب أزمنة الرحلة والفيلم ثلاثي الأبعاد يتبعها.", "대차 이동: 순서가 있는 단계(정차 지점, 방식, 대기)와 각 단계의 실제 미터 경로. 엔진이 시간을 계산하고 3D 영상이 이를 따라갑니다."],
  "Path ID": ["معرّف المسار", "경로 ID"], "Trolley": ["العربة", "대차"], "Push speed (m/s)": ["سرعة الدفع (م/ث)", "수동 이동 속도 (m/s)"], "AGV speed (m/s)": ["سرعة AGV (م/ث)", "AGV 속도 (m/s)"], "Steps": ["الخطوات", "단계"], "Stop": ["نقطة التوقف", "정차 지점"], "Mode": ["النمط", "방식"], "Wait s": ["الانتظار (ث)", "대기 (초)"], "Title": ["العنوان", "제목"],
  "Route points per step [[x,y],...] (m)": ["نقاط المسار لكل خطوة [[x,y],...] (م)", "단계별 경로 점 [[x,y],...] (m)"], "Caption text per step": ["نص الشرح لكل خطوة", "단계별 설명 문구"], "Clearance vs CAD (objects on the route, walls crossed)": ["خلو المسار مقابل أوتوكاد (عناصر على المسار وجدران معترضة)", "CAD 대비 경로 간섭 (경로 위 개체, 가로지르는 벽)"],
  "slab": ["بلاطة أرضية", "슬래브"], "Base height (m)": ["ارتفاع القاعدة (م)", "기준 높이 (m)"], "Process tab": ["تبويب العملية", "공정 탭"],
  "Elevator ride incl. doors (s)": ["رحلة المصعد مع الأبواب (ث)", "엘리베이터 운행 (문 포함, 초)"], "Lift": ["المصعد", "엘리베이터"],
  "3D & film": ["ثلاثي الأبعاد والفيلم", "3D 및 영상"], "Open live 3D": ["فتح العرض ثلاثي الأبعاد", "실시간 3D 열기"], "Render film": ["إنتاج فيلم", "영상 렌더링"], "Rendering...": ["جارٍ الإنتاج...", "렌더링 중..."], "No film yet.": ["لا يوجد فيلم بعد.", "아직 영상이 없습니다."],
  // master data pages and drawer
  "+ New": ["+ جديد", "+ 새로 만들기"], "Duplicate": ["تكرار", "복제"], "Delete": ["حذف", "삭제"], "Bulk edit": ["تعديل جماعي", "일괄 편집"], "Export CSV": ["تصدير CSV", "CSV 내보내기"], "Filter...": ["تصفية...", "필터..."],
  "Nothing here yet.": ["لا يوجد شيء بعد.", "아직 항목이 없습니다."], "No records match the filter.": ["لا توجد سجلات مطابقة للتصفية.", "필터와 일치하는 레코드가 없습니다."],
  "Rename": ["إعادة تسمية", "이름 변경"], "JSON": ["JSON", "JSON"], "Close ✕": ["إغلاق ✕", "닫기 ✕"], "Where used": ["أين يُستخدم", "사용처"], "not referenced": ["غير مستخدم في أي مكان", "참조 없음"], "...": ["...", "..."],
  "(none)": ["(لا شيء)", "(없음)"], "choose...": ["اختر...", "선택..."], "+ add...": ["+ إضافة...", "+ 추가..."], "+ add, Enter": ["+ أضف ثم Enter", "+ 입력 후 Enter"], "one per line": ["عنصر في كل سطر", "한 줄에 하나씩"], "+ row": ["+ صف", "+ 행"],
  "remove": ["إزالة", "삭제"], "remove row": ["إزالة الصف", "행 삭제"],
  "New record ID": ["معرّف السجل الجديد", "새 레코드 ID"], "Duplicate as": ["تكرار باسم", "다음 이름으로 복제"], "Rename (every reference is updated)": ["إعادة تسمية (تُحدَّث كل المراجع)", "이름 변경 (모든 참조가 갱신됨)"],
  "Delete this record?": ["حذف هذا السجل؟", "이 레코드를 삭제할까요?"], "References to it become problems; the change is refused unless you save anyway.": ["المراجع إليه تصبح مشكلات؛ ويُرفض التغيير ما لم تحفظ على أي حال.", "이 레코드를 참조하는 곳은 문제가 되며, 그래도 저장하지 않으면 변경이 거부됩니다."],
  "Edit as JSON": ["تحرير بصيغة JSON", "JSON으로 편집"], "Value": ["القيمة", "값"], "Cancel": ["إلغاء", "취소"], "OK": ["موافق", "확인"], "Confirm": ["تأكيد", "확인"], "Save": ["حفظ", "저장"], "Apply to all": ["تطبيق على الكل", "모두 적용"],
  "Field": ["الحقل", "필드"], "New value": ["القيمة الجديدة", "새 값"], "Close": ["إغلاق", "닫기"], "not valid JSON": ["صيغة JSON غير صحيحة", "올바른 JSON이 아닙니다"], "No change": ["لا تغيير", "변경 없음"],
  "Save anyway": ["احفظ على أي حال", "그래도 저장"], "Import anyway": ["استورد على أي حال", "그래도 가져오기"],
  // dashboard and run summary
  "Latest simulation of the master data, data health and recent runs. Every number is from the declared sample data and illustrative scenarios.": ["آخر محاكاة للبيانات الأساسية وسلامة البيانات وأحدث التشغيلات. كل الأرقام من بيانات العينة المعلنة وسيناريوهات توضيحية.", "마스터 데이터의 최신 시뮬레이션, 데이터 상태, 최근 실행. 모든 수치는 공개된 샘플 데이터와 예시 시나리오 기준입니다."],
  "Loading...": ["جارٍ التحميل...", "불러오는 중..."], "No simulation yet.": ["لا توجد محاكاة بعد.", "아직 시뮬레이션이 없습니다."], "▶ Run the first simulation": ["▶ تشغيل أول محاكاة", "▶ 첫 시뮬레이션 실행"], "Master data": ["البيانات الأساسية", "마스터 데이터"],
  "Recent runs": ["أحدث التشغيلات", "최근 실행"], "Data health": ["سلامة البيانات", "데이터 상태"], "no validation problems": ["لا توجد مشكلات تحقق", "검증 문제 없음"], "Details": ["التفاصيل", "상세"],
  "Finished goods": ["المنتج التام", "완제품"], "In container": ["في الحاوية", "컨테이너 적재"], "Missions done": ["مهام النقل المنجزة", "완료된 운반 작업"], "Mean lead time": ["متوسط زمن الدورة", "평균 리드타임"], "Bottleneck": ["عنق الزجاجة", "병목"],
  "Test yield": ["نسبة نجاح الاختبار", "검사 수율"], "Traffic wait": ["انتظار المرور", "교통 대기"], "Invariants": ["الثوابت", "불변 조건"], "per transport mission": ["لكل مهمة نقل", "운반 작업당"], "BROKEN": ["مكسورة", "위반"],
  "Stations: busy share": ["المحطات: نسبة الانشغال", "스테이션: 가동률"], "Trolleys and workers: busy share": ["العربات والعمال: نسبة الانشغال", "대차와 작업자: 가동률"],
  "Run": ["التشغيل", "실행"], "Scenario": ["السيناريو", "시나리오"], "Hours": ["الساعات", "시간"], "Finished": ["المنتج", "완성"], "Yield": ["النجاح", "수율"], "When": ["الوقت", "시각"], "no runs": ["لا توجد تشغيلات", "실행 기록 없음"],
  // runs
  "Every simulation run is stored with its settings, the master data revision, the full report, every event and every serial number. Tick two runs to compare.": ["يُحفظ كل تشغيل بإعداداته وإصدار البيانات والتقرير الكامل وكل حدث وكل رقم تسلسلي. اختر تشغيلين للمقارنة.", "모든 실행은 설정, 마스터 데이터 리비전, 전체 보고서, 모든 이벤트와 시리얼 번호와 함께 저장됩니다. 비교하려면 두 개를 선택하세요."],
  "▶ New run": ["▶ تشغيل جديد", "▶ 새 실행"], "Compare": ["مقارنة", "비교"], "KPI": ["المؤشر", "지표"], "Change": ["التغيير", "변화"],
  "finished total": ["إجمالي المنتج", "완성 합계"], "shipped": ["المشحون", "출하"], "missions done": ["المهام المنجزة", "완료 작업"], "missions failed": ["المهام الفاشلة", "실패 작업"], "mean lead s": ["متوسط الدورة (ث)", "평균 리드타임 (초)"],
  "yield": ["نسبة النجاح", "수율"], "first pass yield": ["نجاح من أول مرة", "초도 합격률"], "fails": ["الإخفاقات", "불합격"], "traffic wait s": ["انتظار المرور (ث)", "교통 대기 (초)"], "events": ["الأحداث", "이벤트"], "bottleneck": ["عنق الزجاجة", "병목"],
  "Summary": ["الملخص", "요약"], "Stations": ["المحطات", "스테이션"], "Events": ["الأحداث", "이벤트"], "Serials": ["الأرقام التسلسلية", "시리얼"], "Report": ["التقرير", "보고서"], "Delete run": ["حذف التشغيل", "실행 삭제"],
  "Traffic zones (most waits)": ["مناطق المرور (الأكثر انتظارًا)", "교통 구역 (대기 많은 순)"], "Event types": ["أنواع الأحداث", "이벤트 유형"], "no test station in this scenario": ["لا توجد محطة اختبار في هذا السيناريو", "이 시나리오에는 검사 스테이션이 없습니다"],
  "no shipping plan in this scenario": ["لا توجد خطة شحن في هذا السيناريو", "이 시나리오에는 출하 계획이 없습니다"], "no traffic zones": ["لا توجد مناطق مرور", "교통 구역 없음"],
  "Station": ["المحطة", "스테이션"], "Cycles": ["الدورات", "사이클"], "Busy": ["مشغول", "가동"], "Starved s": ["انتظار مواد (ث)", "자재 대기 (초)"], "Blocked s": ["محجوب (ث)", "출력 막힘 (초)"], "Down s": ["متوقف (ث)", "정지 (초)"], "State at end": ["الحالة في النهاية", "종료 시 상태"],
  "Units": ["الوحدات", "운반 자원"], "Kind": ["النوع", "종류"], "all event types": ["كل أنواع الأحداث", "모든 이벤트 유형"], "mission, station or text...": ["مهمة أو محطة أو نص...", "작업, 스테이션 또는 텍스트..."], "Show": ["عرض", "표시"], "Next 200": ["الـ 200 التالية", "다음 200개"],
  "#": ["#", "#"], "Time s": ["الزمن (ث)", "시간 (초)"], "Type": ["النوع", "유형"], "Mission / station": ["المهمة / المحطة", "작업 / 스테이션"], "Data": ["البيانات", "데이터"],
  "serial, item or location...": ["رقم تسلسلي أو صنف أو مكان...", "시리얼, 품목 또는 위치..."], "Search": ["بحث", "검색"], "Serial": ["الرقم التسلسلي", "시리얼"], "Item": ["الصنف", "품목"], "Location at end": ["المكان في النهاية", "종료 시 위치"], "Tests": ["الاختبارات", "검사"], "Fails": ["الإخفاقات", "불합격"],
  "Event": ["الحدث", "이벤트"], "Where": ["المكان", "위치"], "scenario horizon": ["مدة السيناريو", "시나리오 기간"], "scenario seed": ["بذرة السيناريو", "시나리오 시드"], "what is this run for?": ["ما الغرض من هذا التشغيل؟", "이 실행의 목적은?"], "Running...": ["جارٍ التشغيل...", "실행 중..."],
  // change log, database, map, palette, problems
  "Every accepted change, by whom, with the exact before and after of each record. Undo and redo are recorded too; nothing is ever lost.": ["كل تغيير مقبول، ومن قام به، مع حالة كل سجل قبل التغيير وبعده بدقة. يُسجَّل التراجع والإعادة أيضًا؛ لا يضيع شيء.", "승인된 모든 변경과 변경자, 각 레코드의 정확한 변경 전후가 기록됩니다. 실행 취소와 다시 실행도 기록되어 아무것도 잃지 않습니다."],
  "↶ Undo last": ["↶ تراجع عن الأخير", "↶ 마지막 취소"], "everyone": ["الجميع", "전체"], "Rev": ["الإصدار", "리비전"], "Who": ["بواسطة", "작성자"], "undone": ["تم التراجع", "취소됨"], "created": ["أُنشئ", "생성됨"], "deleted": ["حُذف", "삭제됨"],
  "One local SQLite file holds the master data, every change, every command, every run with its events and serial numbers. Read-only SQL below (SELECT only).": ["ملف SQLite محلي واحد يضم البيانات الأساسية وكل تغيير وكل أمر وكل تشغيل بأحداثه وأرقامه التسلسلية. استعلام SQL للقراءة فقط بالأسفل (SELECT فقط).", "로컬 SQLite 파일 하나에 마스터 데이터, 모든 변경, 모든 명령, 모든 실행과 이벤트 및 시리얼 번호가 저장됩니다. 아래는 읽기 전용 SQL입니다(SELECT만)."],
  "records": ["السجلات", "레코드"], "changes": ["التغييرات", "변경"], "commands": ["الأوامر", "명령"], "runs": ["التشغيلات", "실행"], "run events": ["أحداث التشغيل", "실행 이벤트"], "run serials": ["أرقام التشغيل التسلسلية", "실행 시리얼"],
  "Backup now": ["نسخ احتياطي الآن", "지금 백업"], "Export JSON": ["تصدير JSON", "JSON 내보내기"], "Import JSON": ["استيراد JSON", "JSON 가져오기"], "SQL (read-only)": ["SQL (قراءة فقط)", "SQL (읽기 전용)"], "Run query": ["تنفيذ الاستعلام", "쿼리 실행"],
  "Replace all master data with this file?": ["استبدال كل البيانات الأساسية بهذا الملف؟", "모든 마스터 데이터를 이 파일로 바꿀까요?"], "The current data stays in the change log and can be restored with Undo.": ["تبقى البيانات الحالية في سجل التغييرات ويمكن استعادتها بالتراجع.", "현재 데이터는 변경 이력에 남아 실행 취소로 복원할 수 있습니다."],
  "Plan view of entities, aisles and material flows (world coordinates, m). Click to edit; switch on Move to drag an entity (its position is saved as a checked command). Wheel to zoom, drag the background to pan.": ["مسقط أفقي للكيانات والممرات وتدفقات المواد (إحداثيات عامة بالمتر). انقر للتحرير؛ فعّل التحريك لسحب كيان (يُحفظ موضعه كأمر مُتحقق منه). العجلة للتكبير، واسحب الخلفية للتنقل.", "개체, 통로, 자재 흐름의 평면도(월드 좌표, m). 클릭하여 편집하고, 이동을 켜면 개체를 끌 수 있습니다(위치는 검증된 명령으로 저장). 휠로 확대, 배경을 끌어 이동."],
  "flows": ["التدفقات", "흐름"], "✥ Move": ["✥ تحريك", "✥ 이동"], "Fit": ["ملاءمة", "맞춤"],
  "Find a record, go to a page, or type: set process PROC_TEST duration_s=20": ["ابحث عن سجل أو انتقل إلى صفحة أو اكتب: set process PROC_TEST duration_s=20", "레코드 찾기, 페이지 이동 또는 입력: set process PROC_TEST duration_s=20"],
  "Enter to run · arrows to choose · Esc to close · commands: set, new, delete, rename, dup, run, undo, redo, go": ["Enter للتنفيذ · الأسهم للاختيار · Esc للإغلاق · الأوامر: set, new, delete, rename, dup, run, undo, redo, go", "Enter 실행 · 화살표 선택 · Esc 닫기 · 명령: set, new, delete, rename, dup, run, undo, redo, go"],
  "Enter": ["Enter", "Enter"], "page": ["صفحة", "페이지"], "master data": ["بيانات أساسية", "마스터 데이터"], "Undo last change": ["التراجع عن آخر تغيير", "마지막 변경 취소"], "simulation": ["محاكاة", "시뮬레이션"], "nothing found": ["لم يُعثر على شيء", "결과 없음"],
  "The master data passes every check: field checks, blueprint semantics, and every scenario builds an engine model.": ["البيانات الأساسية تجتاز كل الفحوص: فحوص الحقول ودلالات المخطط، وكل سيناريو يبني نموذج محرك.", "마스터 데이터가 모든 검사를 통과합니다: 필드 검사, 청사진 의미 검사, 모든 시나리오의 엔진 모델 생성."]
};

// [regex on the whole phrase, Arabic, Korean]; $1.. are the captured numbers or names.
export const P = [
  [/^(\d+) problems?$/, "$1 مشكلة", "문제 $1개"], [/^(\d+(?:\.\d+)?) s$/, "$1 ث", "$1초"], [/^Delete (\d+)$/, "حذف $1", "$1개 삭제"], [/^(\d+) of (\d+) · double-click a cell to edit$/, "$1 من $2 · انقر مرتين على خلية للتحرير", "$2개 중 $1개 · 셀을 더블클릭하여 편집"],
  [/^updated (.+) by (.+)$/, "حُدِّث $1 بواسطة $2", "$1 $2 님이 수정"], [/^Where used \((\d+)\)$/, "أين يُستخدم ($1)", "사용처 ($1)"], [/^open (.+)$/, "فتح $1", "$1 열기"],
  [/^Saved r(\d+): (.+)$/, "تم الحفظ r$1: $2", "저장됨 r$1: $2"], [/^refused: the change adds (\d+) problem\(s\): ([\s\S]*)$/, "مرفوض: التغيير يضيف $1 مشكلة: $2", "거부됨: 이 변경은 문제 $1개를 추가합니다: $2"],
  [/^Data changed elsewhere \(r(\d+)\): view updated$/, "تغيّرت البيانات من مكان آخر (r$1): تم تحديث العرض", "다른 곳에서 데이터가 변경됨 (r$1): 화면 갱신"], [/^Run (R\d+)$/, "التشغيل $1", "실행 $1"],
  [/^Run (R\d+): (\d+) finished in ([\d.]+) h \((\d+) ms\)$/, "التشغيل $1: $2 منتج تام في $3 ساعة ($4 ms)", "실행 $1: $3시간에 $2개 완성 ($4 ms)"], [/^Run (R\d+): (\d+) finished$/, "التشغيل $1: $2 منتج تام", "실행 $1: $2개 완성"],
  [/^plan (\d+) per container$/, "الخطة $1 لكل حاوية", "컨테이너당 계획 $1개"], [/^(\d+) failed, (\d+) waiting$/, "$1 فاشلة، $2 منتظرة", "실패 $1, 대기 $2"], [/^(station|worker|transporter|carrier) busy ([\d.]+%)$/, "مشغول $2", "가동 $2"],
  [/^first pass ([\d.]+%|-), (\d+) fail\(s\) repaired$/, "من أول مرة $1، أُصلح $2 فاشل", "초도 합격 $1, 불합격 $2개 수리"], [/^(\d+) traffic zone\(s\)$/, "$1 منطقة مرور", "교통 구역 $1개"], [/^(\d+) events, (\d+) serial numbers$/, "$1 حدث، $2 رقم تسلسلي", "이벤트 $1개, 시리얼 $2개"],
  [/^Revision (r\d+) · engine (.+) · database (.+)$/, "الإصدار $1 · المحرك $2 · قاعدة البيانات $3", "리비전 $1 · 엔진 $2 · 데이터베이스 $3"], [/^bar = share of time occupied; total wait (\d+) s$/, "الشريط = نسبة زمن الإشغال؛ إجمالي الانتظار $1 ث", "막대 = 점유 시간 비율; 총 대기 $1초"],
  [/^Trace (.+)$/, "تتبّع $1", "추적 $1"], [/^now: (.+)$/, "الآن: $1", "현재: $1"], [/^The master data has (\d+) problem\(s\); the run may be refused\.$/, "في البيانات الأساسية $1 مشكلة؛ قد يُرفض التشغيل.", "마스터 데이터에 문제가 $1개 있어 실행이 거부될 수 있습니다."],
  [/^Example (\d+)$/, "مثال $1", "예시 $1"], [/^(\d+) row\(s\)$/, "$1 صف", "$1행"], [/^Backup: (.+)$/, "النسخة الاحتياطية: $1", "백업: $1"], [/^Imported: revision (\d+)$/, "تم الاستيراد: الإصدار $1", "가져오기 완료: 리비전 $1"],
  [/^Bulk edit (\d+) records$/, "تعديل جماعي لـ $1 سجل", "레코드 $1개 일괄 편집"], [/^Delete (\d+) record\(s\)\?$/, "حذف $1 سجل؟", "레코드 $1개를 삭제할까요?"], [/^Delete run (R\d+) and its events\?$/, "حذف التشغيل $1 وأحداثه؟", "실행 $1과 이벤트를 삭제할까요?"],
  [/^Run command: (.+)$/, "تنفيذ الأمر: $1", "명령 실행: $1"], [/^Run scenario (.+)$/, "تشغيل السيناريو $1", "시나리오 실행: $1"], [/^Undo: (.+)$/, "تراجع: $1", "실행 취소: $1"]
];

export function tr(text, lang) {
  if (!lang || lang === "en" || text == null) return text;
  const k = String(text).trim(); if (!k) return text; const i = lang === "ar" ? 0 : 1, d = D[k];
  if (d) return String(text).replace(k, d[i]);
  for (const p of P) if (p[0].test(k)) return String(text).replace(k, k.replace(p[0], p[1 + i]));
  return text;
}

const SKIP = new Set(["TEXTAREA", "PRE", "SCRIPT", "STYLE", "CODE"]), ATTRS = ["placeholder", "title", "aria-label"];
// Translate the page now and keep translating whatever the app renders next. getLang() returns the current language.
export function installTranslator(getLang) {
  const textNode = n => { const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || p.closest?.("[translate=no]")) return; const cur = n.data; if (n.__out !== cur) n.__en = cur; const out = tr(n.__en, getLang()); n.__out = out; if (out !== cur) n.data = out; };
  const attrs = el => { if (!el.getAttribute || el.closest("[translate=no]")) return; el.__en ||= {}; el.__out ||= {}; for (const a of ATTRS) { const cur = el.getAttribute(a); if (cur == null) continue; if (el.__out[a] !== cur) el.__en[a] = cur; const out = tr(el.__en[a], getLang()); el.__out[a] = out; if (out !== cur) el.setAttribute(a, out); } };
  const walk = root => { if (root.nodeType === 3) return textNode(root); if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return; attrs(root); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n; while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); } };
  const mo = new MutationObserver(list => { for (const m of list) { if (m.type === "characterData") textNode(m.target); else if (m.type === "attributes") attrs(m.target); else for (const n of m.addedNodes) walk(n); } });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return { refresh: () => { walk(document.body); document.title = tr("Factory Control Center", getLang()); } };
}
