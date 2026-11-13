// Shared M0 release protection. Paths are resolved from the caller's build root.
import {writeFileSync,readdirSync,existsSync,mkdirSync,copyFileSync,renameSync,unlinkSync,constants} from 'node:fs';
import {resolve,dirname,basename,join,sep} from 'node:path';
const fold = p => resolve(p).toLowerCase();
const inside = (p, dir) => fold(p) === fold(dir) || fold(p).startsWith(fold(dir) + sep);
export function planBuildOutput(stage, inFile, outFile, root = process.cwd()) {
  const own = resolve(root, `dist/Material_Flow_Player_v${stage}.html`), input = resolve(root, inFile);
  const outPath = resolve(root, outFile), tempPath = outPath + '.tmp';
  if ([outPath,tempPath].some(p=>fold(p)===fold(input)) || inside(outPath,resolve(root,'dist/versions'))) throw new Error('input and archived versions are read-only');
  if (inside(outPath,resolve(root,'dist/backup'))) throw new Error('dist/backup is never a build output');
  if (fold(dirname(outPath))===fold(resolve(root,'dist')) && /^Material_Flow_Player.*\.html$/i.test(basename(outPath)) && fold(outPath)!==fold(own)) throw new Error('earlier versions are read-only; use --out dist/test/<name>.html');
  return {stage,own,outPath,tempPath,backupDir:resolve(root,'dist/backup'),testOutput:inside(outPath,resolve(root,'dist/test'))};
}
export function publishBuild(output, html) {
  const {stage,own,outPath,tempPath,backupDir}=output;
  mkdirSync(dirname(outPath),{recursive:true});
  // Back up only this stage's own release, after all compilation/docs checks have succeeded.
  if (fold(outPath) === fold(own) && existsSync(outPath)) {
    const dir = backupDir, prefix = `Material_Flow_Player_v${stage}-`;
    mkdirSync(dir, { recursive: true });
    const iso = new Date().toISOString(), stamp = iso.slice(0, 10).replaceAll("-", "") + "-" + iso.slice(11, 19).replaceAll(":", "");
    let serial = 0, backup;
    do { backup = join(dir, prefix + stamp + (serial ? "-" + String(serial).padStart(3, "0") : "") + ".html"); serial++; } while (existsSync(backup));
    copyFileSync(outPath, backup, constants.COPYFILE_EXCL);
    const entries = readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith(".html"))
      // Copying can preserve the source mtime: order by our backup timestamp and collision suffix instead.
      .map(e => ({ name: e.name, stamp: e.name.slice(prefix.length, prefix.length + 15), serial: parseInt(e.name.slice(prefix.length + 16), 10) || 0 }))
      .sort((a, b) => b.stamp.localeCompare(a.stamp) || b.serial - a.serial || b.name.localeCompare(a.name));
    for (const e of entries.slice(5)) {
      const old = resolve(dir, e.name);
      if (fold(dirname(old)) !== fold(dir)) throw new Error("backup escaped its directory");
      unlinkSync(old);
    }
  }
  // A pre-existing temporary file may belong to another build; never truncate it.
  let created = false;
  try { writeFileSync(tempPath, html, { flag: "wx" }); created = true; renameSync(tempPath, outPath); }
  catch (e) { if (created && existsSync(tempPath)) unlinkSync(tempPath); throw e; }
}
