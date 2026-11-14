// Open the real factory in Godot (live, laptop preset) or render a path film (Movie Maker, highest quality) and encode MP4.
// node control/real/film.mjs live [--path inj1-wh]      node control/real/film.mjs film [--path inj1-wh]
// Tool paths: FC_GODOT, FC_FFMPEG (env) or the defaults below. The scene is exported from the database first, so the view
// always shows the current master data and the latest engine timing.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportScene } from "./export-scene.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../.."), filmDir = resolve(here, "../data/film");
export const GODOT = process.env.FC_GODOT || "D:/WORK/Software Development/Apps/Godot/4.7.2/Godot_v4.7.2-stable_win64_console.exe";
export const FFMPEG = process.env.FC_FFMPEG || "C:/Users/m.labib/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe";
const run = (exe, args, opts = {}) => new Promise((ok, bad) => { const p = spawn(exe, args, { windowsHide: true, ...opts }); let out = ""; p.stdout?.on("data", d => out += d); p.stderr?.on("data", d => out += d); p.on("exit", c => c === 0 ? ok(out) : bad(new Error(`${exe.split(/[\\/]/).pop()} exited ${c}: ${out.slice(-400)}`))); p.on("error", bad); });
const godotArgs = scene => ["--path", join(root, "viewer/godot"), "--", `--scene=${scene}`, `--assets=${join(root, "viewer/assets")}`];

export async function openLive({ path = null, db } = {}) {
  if (!existsSync(GODOT)) throw new Error("Godot not found: set FC_GODOT");
  const ex = await exportScene({ db, path, out: join(filmDir, "live-scene.json") }); delete ex.pack;
  const p = spawn(GODOT, [...godotArgs(ex.out), "--quality=1"], { detached: true, stdio: "ignore" }); p.unref();
  return { ok: true, scene: ex.out, objects: ex.objects };
}

export async function renderFilm({ path = null, db, name = null } = {}) {
  if (!existsSync(GODOT) || !existsSync(FFMPEG)) throw new Error("Godot or ffmpeg not found: set FC_GODOT / FC_FFMPEG");
  mkdirSync(filmDir, { recursive: true });
  const ex = await exportScene({ db, path, out: join(filmDir, "film-scene.json") }), base = name || `${path || "path"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
  const avi = join(filmDir, base + ".avi"), mp4 = join(filmDir, base + ".mp4"), t0 = Date.now();
  const g = godotArgs(ex.out); g.splice(2, 0, "--position", "4000,4000", "--write-movie", avi, "--fixed-fps", "30"); g.push("--movie");
  await run(GODOT, g);
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", avi, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
  rmSync(avi, { force: true });
  return { ok: true, file: mp4, name: base + ".mp4", seconds: Math.round((Date.now() - t0) / 1000), run: ex.run };
}

export function films() { return existsSync(filmDir) ? readdirSync(filmDir).filter(f => f.endsWith(".mp4")).map(f => ({ name: f, mb: +(statSync(join(filmDir, f)).size / 1048576).toFixed(1), at: statSync(join(filmDir, f)).mtime.toISOString() })).sort((a, b) => b.at.localeCompare(a.at)) : []; }
export const filmPath = name => join(filmDir, name.replace(/[^\w.\-]/g, ""));

if (process.argv[1]?.endsWith("film.mjs")) {
  const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; }, cmd = process.argv[2];
  const r = cmd === "live" ? await openLive({ path: arg("path"), db: arg("db") }) : await renderFilm({ path: arg("path"), db: arg("db"), name: arg("name") });
  console.log(JSON.stringify(r));
}
