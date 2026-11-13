// Control Center UI test in headless Google Chrome: every page renders without page errors; the owner's flows work
// (first run, edit in the drawer, inline edit, refused edit with "Save anyway", undo/redo, rename, palette, bulk edit, map,
// runs and their tabs, serial trace, change log, database SQL); an agent change through the API appears in the UI by itself.
// Screenshots of every page go to control/test/out/ for review.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";

const OUT = fileURLToPath(new URL("./out/", import.meta.url)); mkdirSync(OUT, { recursive: true });

test("Control Center UI: pages, editing, guard, undo, palette, map, runs, trace, change log, SQL, live agent sync", { timeout: 600000 }, async () => {
  const port = 19000 + Math.floor(Math.random() * 900), srv = spawn(process.execPath, [fileURLToPath(new URL("../server.mjs", import.meta.url)), "--port", String(port), "--db", ":memory:"], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error("server did not start")), 60000); srv.stdout.on("data", d => { if (/Control Center/.test(d)) { clearTimeout(t); ok(); } }); });
  const B = await launch(), base = `http://127.0.0.1:${port}/`, api = (p, o = {}) => fetch(base.slice(0, -1) + p, { method: o.method || "GET", headers: { "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined }).then(r => r.json());
  const rev = () => B.ev("FC.meta.revision"), click = sel => B.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("no element ${sel.replace(/"/g, "'")}"); e.click(); return true; })()`);
  const text = sel => B.ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).innerText || ""`);
  try {
    await B.goto(base);
    // dashboard before any run
    assert.match(await text("#main"), /No simulation yet/); await B.shot(OUT + "01-dashboard-empty.png");
    // first run from the dashboard button through the run dialog
    await click("#first-run"); await B.until("!document.querySelector('#modal').hidden"); await B.ev(`document.querySelector('#r-s').value = 'logic-test'; true`);
    await click("#modal-card [data-m=ok]"); await B.until("FC.view === 'run' && document.querySelector('#tab .cards')", 60000);
    assert.match(await text("#main"), /Finished goods/); await B.shot(OUT + "02-run-summary.png");
    for (const tab of ["stations", "events", "serials", "report"]) { await click(`.tabs [data-tab=${tab}]`); await B.until(`document.querySelector('#tab') && document.querySelector('#tab').innerText.length > 50`, 15000); }
    await click(".tabs [data-tab=serials]"); await B.until("document.querySelector('#sl tr[data-sn]')", 15000); await click("#sl tr[data-sn]"); await B.until("document.querySelector('#trace .panel')", 15000);
    assert.match(await text("#trace"), /Trace SN-/); await B.shot(OUT + "03-serial-trace.png");
    // every master data page lists every record
    const counts = await api("/api/meta").then(() => api("/api/records"));
    for (const [type, list] of Object.entries(counts)) { await click(`#side a[data-type=${type}]`); await B.until(`FC.view === 'type' && FC.type === '${type}'`); const n = await B.ev(`document.querySelectorAll('#main tr[data-id]').length`); assert.equal(n, list.length, `${type}: ${n} rows of ${list.length}`); }
    // drawer edit: rename a worker's display name
    await click('#side a[data-type=entity]'); await B.ev(`document.querySelector('#main tr[data-id="WORKER_02"]').click(); true`); await B.until("!document.querySelector('#drawer').hidden");
    const r0 = await rev(); await B.ev(`(() => { const i = document.querySelector('#drawer [data-path="name"]'); i.value = 'Handler two'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await B.until(`FC.meta.revision === ${r0 + 1}`); assert.equal((await api("/api/records/entity/WORKER_02")).data.name, "Handler two"); await B.shot(OUT + "04-entity-drawer.png");
    // inline edit (double-click a cell)
    await click('#side a[data-type=process]'); await B.ev(`document.querySelector('#main tr[data-id="PROC_TEST"] td[data-col="duration_s"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); true`);
    await B.ev(`(() => { const i = document.querySelector('#main td input.inline'); i.value = '17'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await B.until(`FC.meta.revision === ${r0 + 2}`);
    assert.equal((await api("/api/records/process/PROC_TEST")).data.duration_s, 17);
    // a change that breaks a reference is refused, with "Save anyway"
    await B.ev(`FC.exec('set process PROC_TEST input_location_id=NOPE')`); await B.until("[...document.querySelectorAll('.toast.bad')].some(t => /refused/.test(t.innerText) && t.querySelector('button'))");
    assert.equal((await api("/api/records/process/PROC_TEST")).data.input_location_id, "BUF_TEST_IN"); await B.shot(OUT + "05-refused-edit.png");
    // undo (button) and redo (keyboard)
    await click("#undo"); await B.until(`FC.meta.revision === ${r0 + 3}`); assert.equal((await api("/api/records/process/PROC_TEST")).data.duration_s, 18);
    await B.ev("document.activeElement && document.activeElement.blur(); true"); await B.key("y", { ctrl: true }); await B.until(`FC.meta.revision === ${r0 + 4}`); assert.equal((await api("/api/records/process/PROC_TEST")).data.duration_s, 17);
    // rename through the palette grammar keeps every reference
    await B.ev(`FC.exec('rename entity WORKER_04 HANDLER_FOUR')`); await B.until(`FC.records.handling.some(h => h.data.worker_entity_ids.includes('HANDLER_FOUR'))`);
    assert.equal(await B.ev("FC.meta.problems"), 0);
    // command palette: Ctrl+K, search a record, Enter opens it
    await B.key("k", { ctrl: true }); await B.until("!document.querySelector('#palette').hidden"); await B.type("PROC_PACK"); await B.wait(200); await B.shot(OUT + "06-palette.png"); await B.key("Enter", { text: "\r" });
    await B.until("FC.drawer && FC.drawer.id === 'PROC_PACK'");
    // bulk edit: two aisles at once
    await click('#side a[data-type=edge]'); await B.ev(`['E_SPINE_1','E_SPINE_2'].forEach(id => document.querySelector('#main [data-pick="' + id + '"]').click()); true`); await click('#main [data-act=bulk]');
    await B.ev(`(() => { const s = document.querySelector('#bf'); s.value = 'width_m'; s.dispatchEvent(new Event('change')); document.querySelector('#bv input').value = '3.2'; return true; })()`); await click("#modal-card [data-m=ok]");
    await B.until(`FC.records.edge.filter(e => e.data.width_m === 3.2).length === 2`);
    // layout map: entities drawn; click opens the drawer
    await click('#side a[data-go=map]'); await B.until("document.querySelectorAll('#map [data-ent]').length > 20", 15000); await B.shot(OUT + "07-layout-map.png");
    // change log and database pages
    await click('#side a[data-go=changes]'); await B.until("document.querySelectorAll('#main tr[data-ch]').length >= 8"); await B.ev(`document.querySelector('#main tr[data-ch]').click(); true`); await B.shot(OUT + "08-change-log.png");
    await click('#side a[data-go=database]'); await B.until("document.querySelector('#sqlout table')"); await B.ev(`document.querySelectorAll('[data-q]')[0].click(); true`); await B.until("/finished/.test(document.querySelector('#sqlout').innerText)"); await B.shot(OUT + "09-database.png");
    // runs page and comparison
    await api("/api/run", { method: "POST", body: { scenario: "perfect-quality", hours: 8 } });
    await click('#side a[data-go=runs]'); await B.until("document.querySelectorAll('#main [data-cmp]').length >= 2"); await B.ev(`document.querySelectorAll('#main [data-cmp]').forEach((c, i) => { if (i < 2) c.click(); }); true`); await click("#cmp");
    await B.until("/finished total/.test(document.querySelector('#cmp-out').innerText)"); await B.shot(OUT + "10-runs-compare.png");
    // dashboard with data
    await click('#side a[data-go=dashboard]'); await B.until("/Bottleneck/.test(document.querySelector('#main').innerText)"); await B.shot(OUT + "11-dashboard.png");
    // the agent changes data through the API: the open page updates by itself
    const before = await rev(); await api("/api/command", { method: "POST", body: { actor: "agent", type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "set by the agent" } } } });
    await B.until(`FC.meta.revision === ${before + 1} && FC.records.item.find(i => i.id === 'CARTON').data.name === 'set by the agent'`, 8000);
    // problems badge and list
    await api("/api/command", { method: "POST", body: { type: "record.update", payload: { type: "flow", id: "FLOW_CARTON_PACK", set: { handling_policy_id: "NOPE" } }, force: true } });
    await B.until("FC.meta.problems > 0", 8000); await click("#problems"); await B.until("/problem/.test(document.querySelector('#modal-card').innerText)"); await B.shot(OUT + "12-problems.png");
    await B.ev(`document.querySelector('#modal-card [data-open]').click(); true`); await B.until("FC.drawer && FC.drawer.id === 'FLOW_CARTON_PACK'");
    // languages: Arabic (right to left) and Korean, then back to English
    await click("#modal-card [data-m=cancel]").catch(() => {}); await B.ev("document.querySelector('#drawer [data-d=close]') && document.querySelector('#drawer [data-d=close]').click(); true");
    await B.ev("FC.setLang('ar')"); await B.until("document.documentElement.dir === 'rtl' && /لوحة المتابعة/.test(document.querySelector('#side').innerText)");
    assert.doesNotMatch(await text("#side"), /[A-Za-z]/, "Arabic navigation has no English left"); await click("#side a[data-go=dashboard]"); await B.until("/عنق الزجاجة/.test(document.querySelector('#main').innerText)"); await B.shot(OUT + "13-dashboard-arabic.png");
    await click('#side a[data-type=process]'); await B.ev(`document.querySelector('#main tr[data-id="PROC_TEST"]').click(); true`); await B.until("/المحطة/.test(document.querySelector('#drawer').innerText)"); await B.shot(OUT + "14-process-arabic.png");
    await B.ev("FC.setLang('ko')"); await B.until("document.documentElement.dir === 'ltr' && /대시보드/.test(document.querySelector('#side').innerText) && /스테이션/.test(document.querySelector('#drawer').innerText)");
    assert.doesNotMatch(await text("#side"), /[A-Za-z]/, "Korean navigation has no English left"); await B.shot(OUT + "15-process-korean.png");
    await B.ev("FC.setLang('en')"); await B.until("/Dashboard/.test(document.querySelector('#side').innerText) && /Station entity ID/.test(document.querySelector('#drawer').innerText)");
    assert.deepEqual(B.errors, [], "no page errors: " + JSON.stringify(B.errors));
  } catch (e) { const toasts = await B.ev("[...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | ')").catch(() => ""); e.message += `\n  page errors: ${JSON.stringify(B.errors)}\n  toasts: ${toasts}`; await B.shot(OUT + "failure.png").catch(() => {}); throw e; }
  finally { await B.close(); srv.kill(); }
});
