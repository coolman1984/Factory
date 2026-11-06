// chrome-session.mjs
/**
 * Reusable, dependency-free headless-Google-Chrome session helper.
 *
 * Launches the installed Chrome in headless mode with a fresh throw-away
 * profile, discovers its remote-debugging port through the profile's
 * `DevToolsActivePort` file, connects over the DevTools Protocol using only
 * Node globals (`fetch` / `WebSocket`) and exposes a tiny CDP façade.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Installed Google Chrome executable (Windows). */
const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Await a number of milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate/normalise the `file` option to an absolute `file:` URL string.
 * @param {string|URL} file
 * @returns {string}
 */
function toFileHref(file) {
  let url;
  if (file instanceof URL) {
    url = file;
  } else if (typeof file === 'string') {
    try {
      url = new URL(file);
    } catch {
      throw new TypeError('chrome-session: "file" must be a valid file: URL');
    }
  } else {
    throw new TypeError('chrome-session: "file" option is required and must be a file: URL');
  }
  if (url.protocol !== 'file:') {
    throw new TypeError(`chrome-session: "file" must use the file: protocol (received "${url.protocol}")`);
  }
  return url.href;
}

/**
 * Human-readable text for a CDP `exceptionDetails` object.
 * @param {object|undefined} details
 * @returns {string}
 */
function exceptionText(details) {
  if (!details) return 'unknown exception';
  const ex = details.exception ?? {};
  if (typeof ex.description === 'string' && ex.description) return ex.description;
  if (ex.value !== undefined) return String(ex.value);
  if (typeof details.text === 'string' && details.text) return details.text;
  return 'unknown exception';
}

/**
 * Flatten a `Runtime.consoleAPICalled` payload into a single line.
 * @param {object|undefined} params
 * @returns {string}
 */
function consoleText(params) {
  const parts = (params?.args ?? []).map((arg) => {
    if (arg.value !== undefined) {
      return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
    }
    if (arg.unserializableValue !== undefined) return String(arg.unserializableValue);
    if (arg.description !== undefined) return arg.description;
    return arg.type ?? 'unknown';
  });
  return parts.join(' ') || '(no arguments)';
}

/**
 * Launch headless Chrome, load a file: URL and return a CDP façade.
 *
 * @param {object} options
 * @param {string|URL} options.file        Local page as a file: URL (required).
 * @param {number} [options.width=1600]    Viewport width.
 * @param {number} [options.height=900]    Viewport height.
 * @param {boolean} [options.hardware=true] Hardware ANGLE/D3D11 GPU (false = software).
 * @param {number} [options.timeout=60000] Startup deadline AND per-CDP-call timeout (ms).
 * @param {string} [options.chromePath]    Override the Chrome executable path.
 * @returns {Promise<{call:Function,evaluate:Function,screenshot:Function,close:Function,errors:string[],gpu:(string|null)}>}
 */
export async function openChrome(options = {}) {
  const {
    file,
    width = 1600,
    height = 900,
    hardware = true,
    timeout = 60000,
    chromePath = DEFAULT_CHROME,
  } = options ?? {};

  const pageUrl = toFileHref(file);

  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('chrome-session: global WebSocket is unavailable (Node.js 22+ required).');
  }
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new TypeError('chrome-session: "timeout" must be a positive number of milliseconds.');
  }

  const deadline = Date.now() + timeout;
  const remaining = () => Math.max(1, deadline - Date.now());

  // Fresh throw-away profile under the OS temp directory.
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'chrome-session-'));

  let child = null;
  let ws = null;
  let closed = false;
  let nextId = 1;
  let pageSession = null;

  const pending = new Map(); // id -> { resolve, reject, timer, method }
  const listeners = new Set(); // CDP event subscribers
  const errors = []; // collected runtime/console errors
  const stderrChunks = [];

  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--mute-audio',
    '--hide-scrollbars',
  ];

  if (hardware) {
    // Hardware-accelerated WebGL through ANGLE/D3D11.
    args.push('--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist');
  } else {
    // Software rendering only.
    args.push('--use-angle=swiftshader', '--disable-gpu-compositing');
  }

  args.push('about:blank');

  // --- launch ---------------------------------------------------------------
  child = spawn(chromePath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const startup = { error: null, exited: false, exit: null };

  child.on('error', (err) => {
    startup.error = err;
  });
  child.on('exit', (code, signal) => {
    if (!closed) {
      startup.exited = true;
      startup.exit = { code, signal };
    }
  });
  child.stderr?.on('data', (chunk) => {
    stderrChunks.push(chunk.toString());
    if (stderrChunks.length > 100) stderrChunks.shift();
  });

  const stderrTail = () => {
    const text = stderrChunks.join('').trim();
    return text ? `\n--- chrome stderr ---\n${text.slice(-2000)}` : '';
  };

  // --- teardown (own process + own temp profile only) -----------------------
  const cleanup = async () => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('chrome-session: session closed'));
    }
    pending.clear();
    listeners.clear();

    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }

    if (child && child.exitCode === null && child.signalCode === null) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(2000)]);
    }

    try {
      if (path.dirname(path.resolve(profileDir)) !== path.resolve(os.tmpdir()) || !path.basename(profileDir).startsWith('chrome-session-')) throw new Error('Unsafe profile cleanup target');
      await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } catch {
      /* best effort */
    }
  };

  try {
    // --- wait for the DevTools endpoint (profile DevToolsActivePort) --------
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    let port = null;
    let wsPath = '';

    for (;;) {
      if (startup.error) {
        throw new Error(`chrome-session: could not start Chrome: ${startup.error.message}`);
      }
      if (startup.exited) {
        throw new Error(
          `chrome-session: Chrome exited during startup (code=${startup.exit.code}, signal=${startup.exit.signal})${stderrTail()}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(`chrome-session: timed out after ${timeout}ms waiting for Chrome to start${stderrTail()}`);
      }
      try {
        const text = await readFile(portFile, 'utf8');
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const parsed = Number.parseInt(lines[0] ?? '', 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          port = parsed;
          wsPath = lines[1] ?? '';
          break;
        }
      } catch {
        /* file not written yet */
      }
      await sleep(100);
    }

    // --- connect to the browser DevTools endpoint ---------------------------
    let browserWsUrl;
    if (wsPath) {
      browserWsUrl = `ws://127.0.0.1:${port}${wsPath}`;
    } else {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(remaining())});
      if (!res.ok) throw new Error(`chrome-session: /json/version returned HTTP ${res.status}`);
      browserWsUrl = (await res.json()).webSocketDebuggerUrl;
      if (!browserWsUrl) throw new Error('chrome-session: could not resolve the DevTools WebSocket URL');
    }

    ws = new WebSocket(browserWsUrl);

    await new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
      };
      const onOpen = () => {
        finish();
        resolve();
      };
      const onError = (event) => {
        finish();
        reject(new Error(`chrome-session: DevTools WebSocket error: ${event?.message ?? 'connection failed'}`));
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error('chrome-session: timed out connecting to the DevTools WebSocket'));
      }, remaining());
      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('error', onError, { once: true });
    });

    // --- CDP plumbing -------------------------------------------------------
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const frame = { id, method, params };
        if (sessionId) frame.sessionId = sessionId;
        const timer = setTimeout(() => {
          if (pending.delete(id)) {
            reject(new Error(`chrome-session: CDP call "${method}" timed out after ${timeout}ms`));
          }
        }, timeout);
        pending.set(id, { resolve, reject, timer, method });
        try {
          ws.send(JSON.stringify(frame));
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          reject(new Error(`chrome-session: failed to send CDP call "${method}": ${err.message}`));
        }
      });

    ws.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return;
      }
      if (message.id !== undefined && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) {
          entry.reject(
            new Error(
              `chrome-session: CDP "${entry.method}" protocol error ${message.error.code}: ${message.error.message}`,
            ),
          );
        } else {
          entry.resolve(message.result);
        }
        return;
      }
      if (message.method) {
        for (const listener of [...listeners]) {
          try {
            listener(message);
          } catch {
            /* a subscriber throwing must not break the pump */
          }
        }
      }
    });

    ws.addEventListener('close', () => {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('chrome-session: DevTools connection closed'));
      }
      pending.clear();
    });

    const waitForEvent = (method, sessionId, ms) =>
      new Promise((resolve, reject) => {
        const handler = (message) => {
          if (message.method !== method) return;
          if (sessionId && message.sessionId !== sessionId) return;
          clearTimeout(timer);
          listeners.delete(handler);
          resolve(message.params);
        };
        const timer = setTimeout(() => {
          listeners.delete(handler);
          reject(new Error(`chrome-session: timed out waiting for ${method}`));
        }, ms);
        listeners.add(handler);
      });

    // --- pick and attach to a page target -----------------------------------
    let pageTarget = null;
    for (;;) {
      if (startup.exited) {
        throw new Error(`chrome-session: Chrome exited before a page target appeared${stderrTail()}`);
      }
      if (Date.now() > deadline) {
        throw new Error('chrome-session: timed out waiting for a page target');
      }
      const { targetInfos = [] } = await send('Target.getTargets');
      const pages = targetInfos.filter((target) => target.type === 'page');
      pageTarget = pages.find((target) => target.url && !target.url.startsWith('about:')) ?? pages[0] ?? null;
      if (pageTarget) break;
      await sleep(100);
    }

    const attach = await send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
    pageSession = attach.sessionId;

    await send('Runtime.enable', {}, pageSession);
    await send('Page.enable', {}, pageSession);

    // Collect runtime + console errors for the lifetime of the session.
    listeners.add((message) => {
      if (message.sessionId !== pageSession) return;
      if (message.method === 'Runtime.exceptionThrown') {
        errors.push(exceptionText(message.params?.exceptionDetails));
      } else if (
        message.method === 'Runtime.consoleAPICalled' &&
        (message.params?.type === 'error' || message.params?.type === 'assert')
      ) {
        errors.push(consoleText(message.params));
      }
    });

    // --- public façade ------------------------------------------------------
    // Pass `null` as the third argument for a browser-level (session-less) call.
    const call = (method, params = {}, sessionIdArg = pageSession) => send(method, params, sessionIdArg);

    const evaluate = async (expression, evalOptions = {}) => {
      const { awaitPromise = true, returnByValue = true, sessionId: evalSession = pageSession } = evalOptions ?? {};
      const result = await send(
        'Runtime.evaluate',
        { expression, awaitPromise, returnByValue, userGesture: true },
        evalSession,
      );
      if (result?.exceptionDetails) {
        throw new Error(`chrome-session: evaluate threw: ${exceptionText(result.exceptionDetails)}`);
      }
      const remote = result?.result;
      if (!remote) return undefined;
      if (remote.value !== undefined) return remote.value;
      if (remote.unserializableValue !== undefined) return remote.unserializableValue;
      return undefined;
    };

    const screenshot = async (targetPath) => {
      if (typeof targetPath !== 'string' || targetPath.length === 0) {
        throw new TypeError('chrome-session: screenshot(path) requires a non-empty file path');
      }
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, pageSession);
      if (!data) throw new Error('chrome-session: Page.captureScreenshot returned no data');
      await writeFile(targetPath, Buffer.from(data, 'base64'));
      return targetPath;
    };

    const close = async () => {
      if (closed) return;
      closed = true;
      try { await send('Browser.close', {}, null); } catch { /* Chrome may close before replying */ }
      await cleanup();
    };

    // --- load the page ------------------------------------------------------
    const loaded = waitForEvent('Page.loadEventFired', pageSession, remaining());
    loaded.catch(() => {});
    const navigation = await send('Page.navigate', { url: pageUrl }, pageSession);
    if (navigation?.errorText) {
      throw new Error(`chrome-session: navigation to ${pageUrl} failed: ${navigation.errorText}`);
    }
    await loaded;

    // --- GPU / WebGL renderer string ----------------------------------------
    let gpu = null;
    try {
      gpu = await evaluate(`(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return null;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) return gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
        return gl.getParameter(gl.RENDERER);
      })()`);
    } catch (err) {
      errors.push(`gpu probe failed: ${err.message}`);
    }
    if (gpu !== null && typeof gpu !== 'string') gpu = String(gpu);

    const on = (method, handler) => { const listener = message => { if (message.method === method) handler(message.params); }; listeners.add(listener); return () => listeners.delete(listener); };
    return { call, evaluate, screenshot, close, errors, gpu, on };
  } catch (err) {
    closed = true;
    await cleanup();
    throw err;
  }
}



