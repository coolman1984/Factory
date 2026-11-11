// Deterministic local film export. Browser frames have story timestamps; ffmpeg owns the constant-rate video clock.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { once } from 'node:events';

export async function exportFilm(pg, take, out, { injectFreeze = false } = {}) {
  const fps = take.fps ?? 30, seconds = (take.t1 - take.t0) / take.speed, frames = Math.round(seconds * fps);
  if (!Number.isInteger(fps) || fps < 1 || fps > 120 || !Number.isFinite(seconds) || seconds <= 0 || Math.abs(frames / fps - seconds) > 1e-6) throw new Error('Choose a range/speed giving a whole number of video frames');
  // Check tools before changing browser state. No package download or network access.
  execFileSync('ffmpeg', ['-version'], { windowsHide: true, stdio: 'pipe' });
  execFileSync('ffprobe', ['-version'], { windowsHide: true, stdio: 'pipe' });
  mkdirSync(dirname(out), { recursive: true });
  const temp = out.replace(/\.mp4$/i, '') + '.partial.mp4', receipt = { take, seconds, fps, frames, status: 'rendering', samples: [] };
  let proc, log = '', done, last, repeated = 0;
  try {
    const info = await pg.ev(`MFX.prepareExport(${JSON.stringify({ ...take, fps })})`);
    proc = spawn('ffmpeg', ['-hide_banner', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-video_track_timescale', String(fps * 1000), '-movflags', '+faststart', temp], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    proc.stderr.on('data', b => { log = (log + b).slice(-12000); });
    proc.stdin.on('error', () => {});
    done = new Promise((resolve, reject) => { proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + log))); });
    // Attach a handler now so an early encoder exit is never an unhandled rejection while rendering.
    done.catch(() => {});
    for (let i = 0; i < frames; i++) {
      let frame = await pg.ev(`MFX.exportFrame(${i})`);
      const expected = take.t0 + i / fps * take.speed;
      if (Math.abs(frame.t - expected) > 1e-5) throw new Error(`Story clock drift at frame ${i}: ${frame.t} versus ${expected}`);
      if (injectFreeze && i < fps * 2 && last) frame.jpeg = last.jpeg;
      repeated = last && frame.jpeg === last.jpeg ? repeated + 1 : 0;
      if (repeated >= fps * .75 && Math.hypot(frame.lot[0] - receipt.samples[Math.max(0, i - repeated)].lot[0], frame.lot[1] - receipt.samples[Math.max(0, i - repeated)].lot[1]) > .3) throw new Error(`Frozen rendered frames while trolley moves at frame ${i}`);
      receipt.samples.push({ frame: i, t: frame.t, lot: frame.lot });
      if (!proc.stdin.write(Buffer.from(frame.jpeg, 'base64'))) await once(proc.stdin, 'drain');
      last = frame;
      if (i % (fps * 5) === 0) console.log(`film: frame ${i}/${frames}, story ${frame.t.toFixed(3)} s`);
    }
    proc.stdin.end(); await done;
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,duration,width,height,r_frame_rate', '-of', 'json', temp], { encoding: 'utf8', windowsHide: true }));
    const stream = probe.streams[0]; receipt.video = stream;
    if (+stream.nb_read_frames !== frames || Math.abs(+stream.duration - seconds) > 1 / fps + 1e-5) throw new Error('Encoded length/frame count mismatch: ' + JSON.stringify(stream));
    // Check decoded video too. Static holds are legal; a freeze during measurable trolley travel is a failure.
    const check = spawn('ffmpeg', ['-hide_banner', '-i', temp, '-vf', 'freezedetect=n=-60dB:d=0.75', '-an', '-f', 'null', '-'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let frozen = ''; check.stderr.on('data', b => frozen += b);
    await new Promise((resolve, reject) => { check.on('error', reject); check.on('close', c => c === 0 ? resolve() : reject(new Error('Cannot decode exported video'))); });
    receipt.freezeLog = frozen.split(/\r?\n/).filter(l => /freeze_(?:start|end|duration)/.test(l));
    let start = null;
    const checkInterval = (a, b) => { const samples = receipt.samples.filter(q => q.frame / fps >= a && q.frame / fps <= b); if (samples.length < 2) return; const p = samples[0].lot; if (samples.some(q => Math.hypot(q.lot[0] - p[0], q.lot[1] - p[1]) > .3 || Math.abs(q.lot[2] - p[2]) > .01)) throw new Error(`Encoded freeze during trolley motion: ${a.toFixed(3)}–${b.toFixed(3)} film seconds`); };
    for (const l of receipt.freezeLog) { const a = /freeze_start: ([\d.]+)/.exec(l), b = /freeze_end: ([\d.]+)/.exec(l); if (a) start = +a[1]; if (b && start != null) { checkInterval(start, +b[1]); start = null; } }
    if (start != null) checkInterval(start, seconds);
    if (pg.errors.length) throw new Error(pg.errors.join(' | '));
    receipt.status = 'pass'; receipt.info = info; renameSync(temp, out);
    console.log(`${out}: H.264 MP4, ${stream.duration} s measured, ${frames} frames, ${fps} fps, camera ${take.cam}; freeze/length checks PASS`);
    return receipt;
  } catch (e) {
    receipt.status = 'fail'; receipt.error = e.message; proc?.stdin.destroy(); proc?.kill(); if (done) await done.catch(() => {}); throw e;
  } finally {
    writeFileSync(out + '.json', JSON.stringify(receipt, null, 1));
    await pg.ev('MFX.finishExport(); 1').catch(() => {});
  }
}
