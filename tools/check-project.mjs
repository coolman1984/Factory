// Validates one project's data against the multi-project contract (docs/PLAN-PATHS-2026-11-08.md, section "Contract").
// Usage: node tools/check-project.mjs <id>     (reads private/projects/<id>/flow.json and replica.json)
// Exit 0 = OK, 1 = problems listed. Prints counts only, never plan contents.
import { readFileSync, existsSync } from "node:fs";
const id = process.argv[2];
if (!id) { console.error("usage: node tools/check-project.mjs <id>"); process.exit(1); }
const dir = new URL(`../private/projects/${id}/`, import.meta.url);
const bad = [], need = (ok, msg) => { if (!ok) bad.push(msg); };
const load = (f) => { try { return JSON.parse(readFileSync(new URL(f, dir), "utf8")); } catch (e) { bad.push(`${f}: ${e.message}`); return null; } };
const F = load("flow.json"), R = load("replica.json");
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
if (F && R) {
  need(F.id === id, `flow.id must be "${id}"`);
  need(typeof F.title === "string" && F.title, "flow.title missing");
  need(R.scale === 0.3, "replica.scale must be 0.3 (1 unit = 0.30 m)");
  const plates = F.plates || {}, names = Object.keys(plates);
  need(names.length > 0, "flow.plates empty");
  for (const [k, P] of Object.entries(plates)) {
    need(typeof P.label === "string", `plate ${k}: label`);
    need([P.dx, P.dz, P.lift].every(Number.isFinite), `plate ${k}: dx, dz, lift must be numbers`);
    need(Array.isArray(P.box) && P.box.length === 4 && P.box[0] < P.box[2] && P.box[1] < P.box[3], `plate ${k}: box [x0,y0,x1,y1]`);
    for (const p of P.pics || []) {
      need([p.x, p.y, p.w, p.h].every(Number.isFinite) && p.w > 0 && p.h > 0, `plate ${k} pic ${p.file}: x,y,w,h`);
      need(existsSync(new URL(`plans/${p.file}.png`, dir)), `plate ${k}: missing plans/${p.file}.png`);
    }
    need((P.pics || []).length > 0, `plate ${k}: no pics`);
  }
  for (const [i, a] of names.entries()) for (const b of names.slice(i + 1)) {   // plateOf() finds a plate by its box: boxes must not overlap
    const A = plates[a].box, B = plates[b].box;
    if (A && B) need(A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1], `plates ${a} and ${b}: boxes overlap (place the upper floor apart in the frame)`);
  }
  const inBox = (k, [x, y], m = 2) => { const b = plates[k]?.box; return b && x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m; };
  const lifts = F.elevators || [];
  for (const e of lifts) {
    need(typeof e.label === "string" && isPt(e.low) && isPt(e.high), `elevator ${e.label}: label, low, high`);
    need(plates[e.lowPlate] && plates[e.highPlate], `elevator ${e.label}: lowPlate/highPlate must be plate names`);
    if (plates[e.lowPlate]) need(inBox(e.lowPlate, e.low), `elevator ${e.label}: low outside its plate box`);
    if (plates[e.highPlate]) need(inBox(e.highPlate, e.high), `elevator ${e.label}: high outside its plate box`);
    if (plates[e.lowPlate] && plates[e.highPlate] && isPt(e.low) && isPt(e.high)) {   // stacked floors: the shaft must be vertical
      const L = plates[e.lowPlate], H = plates[e.highPlate], off = Math.hypot(e.high[0] + H.dx - e.low[0] - L.dx, e.high[1] + H.dz - e.low[1] - L.dz);
      need(off < 3, `elevator ${e.label}: not vertical when stacked (high + (dx,dz) is ${off.toFixed(1)} units from low; set the upper plate's dx/dz)`);
    }
  }
  const nodes = F.nodes || {};
  for (const [k, n] of Object.entries(nodes)) {
    need(String(n.id) === k, `node ${k}: id must equal its key`);
    need(Number.isFinite(n.x) && Number.isFinite(n.y), `node ${k}: x,y`);
    need(plates[n.plate], `node ${k}: unknown plate ${n.plate}`);
    if (plates[n.plate]) need(inBox(n.plate, [n.x, n.y]), `node ${k} (${n.text || n.kind}): outside plate ${n.plate} box`);
    need(["gr", "mapping", "dest", "area", "lift"].includes(n.kind), `node ${k}: kind must be gr|mapping|dest|area|lift`);
    need(["auto", "manual", "none"].includes(n.mode), `node ${k}: mode must be auto|manual|none`);
  }
  need((F.flows || []).length > 0, "no flows");
  for (const f of F.flows || []) {
    need(f.id && f.name && f.color, `flow ${f.id}: id, name, color`);
    need((f.steps || []).length >= 2, `flow ${f.id}: at least 2 steps`);
    for (const [i, s] of (f.steps || []).entries()) {
      const tag = `flow ${f.id} step ${i + 1}`;
      need(nodes[s.node], `${tag}: node ${s.node} not in nodes`);
      need(s.title && s.what, `${tag}: title and what`);
      need(["flow", "auto"].includes(s.mode), `${tag}: mode flow|auto (auto = AGV)`);
      need(["2d", "3d"].includes(s.view) && Number.isFinite(s.dist), `${tag}: view, dist`);
      if (s.path === "lift") { need(s.lift === true && lifts.some((e) => e.label === s.elevator), `${tag}: lift step needs lift:true and elevator label`); continue; }
      if (i === 0) { need(s.path === null, `${tag}: first step path must be null`); continue; }
      need(Array.isArray(s.path) && s.path.length >= 2 && s.path.every(isPt), `${tag}: path must be >= 2 [x,y] points`);
      if (Array.isArray(s.path) && nodes[s.node]) {
        const end = s.path.at(-1), n = nodes[s.node];
        need(Math.hypot(end[0] - n.x, end[1] - n.y) < 12, `${tag}: path must end at its node`);
        const level = names.filter((k) => plates[k].lift === plates[n.plate].lift);   // a path may cross plates of the same floor
        need(s.path.every((p) => level.some((k) => inBox(k, p, 6))), `${tag}: path leaves the floor of plate ${n.plate}`);
        for (let j = 1; j < s.path.length; j++) { const [a, b] = [s.path[j - 1], s.path[j]]; need(Math.abs(a[0] - b[0]) < .05 || Math.abs(a[1] - b[1]) < .05, `${tag}: segment ${j} is diagonal`); }
      }
    }
  }
  for (const key of ["walls", "racks", "columns", "machines", "rooms", "lifts"]) need(Array.isArray(R[key]), `replica.${key} must be an array`);
  for (const r of [...(R.racks || []), ...(R.machines || []), ...(R.rooms || []), ...(R.lifts || [])]) need(plates[r.plate], `replica item on unknown plate ${r.plate}`);
  for (const w of R.walls || []) need(plates[w.plate] && isPt(w.a) && isPt(w.b), `replica wall bad`);
  need(existsSync(new URL("evidence/overlay.png", dir)), "missing evidence/overlay.png (take-off drawn over the plan)");
  if (!bad.length) console.log(`OK ${id}: plates ${names.length}, nodes ${Object.keys(nodes).length}, flows ${F.flows.length}, steps ${F.flows.reduce((a, f) => a + f.steps.length, 0)}, walls ${R.walls.length}, racks ${R.racks.length}, machines ${R.machines.length}`);
}
if (bad.length) { console.log(`FAILED ${id}: ${bad.length} problem(s)\n- ` + [...new Set(bad)].slice(0, 60).join("\n- ")); process.exit(1); }
