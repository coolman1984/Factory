// Layout journal (WP2.x): a versioned document (a layout, a scene) changed only through commands, like the world.
// Every edit is a patch with its exact inverse, checked by the viewer's validator before it is accepted; a refused edit
// changes nothing. Undo and redo are commands too, so the journal is append-only and its hash chain proves the history.
// Commands: { command_id, expected_revision?, type: "doc.edit" | "doc.undo" | "doc.redo", payload }.
//   doc.edit payload: { label?, doc } (the new document; the journal computes the patch) or { label?, patch }.
import { EngineError } from "./units.js";
import { canonical, hash64, clone } from "./canon.js";

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => canonical(a) === canonical(b);

// Minimal patch from a to b: [{ op: "set", path, old?, value } | { op: "remove", path, old }]. Arrays of different length,
// or of objects without ids, are replaced as a whole only where they differ.
export function diff(a, b, path = [], out = []) {
  if (same(a, b)) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a).sort()) if (!(k in b)) out.push({ op: "remove", path: [...path, k], old: clone(a[k]) });
    for (const k of Object.keys(b).sort()) { if (!(k in a)) out.push({ op: "set", path: [...path, k], value: clone(b[k]) }); else diff(a[k], b[k], [...path, k], out); }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) { for (let i = 0; i < a.length; i++) diff(a[i], b[i], [...path, i], out); return out; }
  out.push({ op: "set", path, old: clone(a), value: clone(b) }); return out;
}
// Inverse of a patch (apply it after the patch to get the original back).
export function invert(patch) {
  return patch.slice().reverse().map(o => o.op === "remove" ? { op: "set", path: o.path, value: clone(o.old) } : ("old" in o ? { op: "set", path: o.path, old: clone(o.value), value: clone(o.old) } : { op: "remove", path: o.path, old: clone(o.value) }));
}
// Apply a patch to a copy of doc. Every `old` must match what is there (a stale patch is refused, never half-applied).
export function applyPatch(doc, patch) {
  let root = clone(doc);
  for (const o of patch) {
    if (!Array.isArray(o.path)) throw new EngineError("bad_patch", "patch operation without a path");
    if (!o.path.length) { if ("old" in o && !same(root, o.old)) throw new EngineError("patch_conflict", "document root differs from the patch"); if (o.op === "remove") throw new EngineError("bad_patch", "cannot remove the document root"); root = clone(o.value); continue; }
    let parent = root; for (const k of o.path.slice(0, -1)) { if (parent == null || typeof parent !== "object" || !(k in parent)) throw new EngineError("patch_conflict", `path ${o.path.join("/")} does not exist`); parent = parent[k]; }
    const key = o.path[o.path.length - 1];
    if (parent == null || typeof parent !== "object") throw new EngineError("patch_conflict", `path ${o.path.join("/")} has no parent object`);
    if ("old" in o && !same(parent[key], o.old)) throw new EngineError("patch_conflict", `${o.path.join("/")} changed since the patch was made`);
    if (o.op === "remove") { if (!(key in parent)) throw new EngineError("patch_conflict", `${o.path.join("/")} is already gone`); if (Array.isArray(parent)) parent.splice(key, 1); else delete parent[key]; }
    else if (o.op === "set") parent[key] = clone(o.value);
    else throw new EngineError("bad_patch", `unknown patch op ${o.op}`);
  }
  return root;
}

export class Journal {
  // validate(newDoc, oldDoc) -> list of readable problems (empty = accept). The viewer supplies it (it knows its document).
  constructor(doc, { validate = null, name = "document" } = {}) {
    this.name = name; this.validate = validate; this.doc = clone(doc); this.revision = 0; this.entries = []; this.commands = new Map();
    this.undoStack = []; this.redoStack = []; this.hash = hash64("journal:" + name + ":" + canonical(this.doc)); this.base = this.hash;
  }
  get current() { return clone(this.doc); }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  // The document an undo would give (null if nothing to undo); lets a viewer recognise its own undo.
  peekUndo() { const e = this.undoStack[this.undoStack.length - 1]; return e ? applyPatch(this.doc, invert(e.patch)) : null; }
  peekRedo() { const e = this.redoStack[this.redoStack.length - 1]; return e ? applyPatch(this.doc, e.patch) : null; }
  submit(cmd) {
    if (!cmd || typeof cmd.command_id !== "string" || !cmd.command_id || typeof cmd.type !== "string") return { ok: false, code: "bad_command", reason: "command needs command_id and type" };
    if (this.commands.has(cmd.command_id)) return { ...this.commands.get(cmd.command_id), duplicate: true };
    let r;
    try {
      if (cmd.expected_revision != null && cmd.expected_revision !== this.revision) throw new EngineError("stale_revision", `expected revision ${cmd.expected_revision}, journal is at ${this.revision}`);
      const p = cmd.payload || {};
      let patch, label, kind = cmd.type, target = null;
      if (kind === "doc.edit") { patch = p.patch ? clone(p.patch) : diff(this.doc, p.doc); label = p.label || "edit"; }
      else if (kind === "doc.undo") { target = this.undoStack[this.undoStack.length - 1]; if (!target) throw new EngineError("nothing_to_undo", "nothing to undo"); patch = invert(target.patch); label = "undo: " + target.label; }
      else if (kind === "doc.redo") { target = this.redoStack[this.redoStack.length - 1]; if (!target) throw new EngineError("nothing_to_redo", "nothing to redo"); patch = clone(target.patch); label = "redo: " + target.label; }
      else throw new EngineError("unknown_command", `unknown journal command ${kind}`);
      if (!patch.length) { r = { ok: true, command_id: cmd.command_id, revision: this.revision, result: { changed: false } }; this.commands.set(cmd.command_id, r); return { ...r }; }
      const next = applyPatch(this.doc, patch), problems = this.validate ? this.validate(next, this.doc) || [] : [];
      if (problems.length) throw new EngineError("invalid_edit", problems.join("; "), problems);
      this.doc = next; this.revision++;
      if (kind === "doc.edit") { this.undoStack.push({ rev: this.revision, label, patch }); this.redoStack = []; }
      else if (kind === "doc.undo") this.redoStack.push(this.undoStack.pop());
      else this.undoStack.push(this.redoStack.pop());
      const entry = { rev: this.revision, command: cmd.command_id, type: kind, label, ops: patch.length, patch, ...(target ? { of: target.rev } : {}) };
      this.hash = hash64(this.hash + canonical(entry)); entry.hash = this.hash; this.entries.push(entry);
      r = { ok: true, command_id: cmd.command_id, revision: this.revision, result: { changed: true, ops: patch.length, label } };
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      r = { ok: false, command_id: cmd.command_id, code: e.code, reason: e.message, ...(e.detail ? { problems: e.detail } : {}) };
    }
    this.commands.set(cmd.command_id, r); return { ...r };
  }
  // Replaying every entry's patch from the first document must give the current one (proof that the history is complete).
  verify(first) { let d = clone(first), h = hash64("journal:" + this.name + ":" + canonical(first)); for (const e of this.entries) { d = applyPatch(d, e.patch); const { hash, ...rest } = e; h = hash64(h + canonical(rest)); if (h !== hash) return false; } return same(d, this.doc) && h === this.hash; }
  history() { return this.entries.map(e => ({ rev: e.rev, type: e.type, label: e.label, ops: e.ops, command: e.command })); }
  state() { return { format: "fe-journal", version: 1, name: this.name, base: this.base, revision: this.revision, hash: this.hash, doc: clone(this.doc), entries: clone(this.entries), undo: clone(this.undoStack), redo: clone(this.redoStack) }; }
}
