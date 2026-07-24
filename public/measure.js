/* ============================================================
   計測エンジン（共通）
   window.Measure.run({...}) で下り・上り・応答を計測する
   ============================================================ */

window.Measure = (function () {
  const CFG = {
    DOWN_MS: 8000,
    DOWN_STREAMS: 6,
    DOWN_WARMUP: 1800,
    DOWN_CHUNK: 25 * 1024 * 1024,
    UP_MS: 6000,
    UP_STREAMS: 4,
    UP_CHUNK: 4 * 1024 * 1024,
    PING_N: 12,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mbps = (bytes, ms) => (ms <= 0 ? 0 : (bytes * 8) / (ms / 1000) / 1e6);

  /* ── 接続元の判定 ── */
  async function meta() {
    try {
      const res = await fetch('/api/meta?r=' + Math.random(), { cache: 'no-store' });
      return await res.json();
    } catch {
      return { connection: 'unknown', asOrg: '', colo: '' };
    }
  }

  /* ── 応答時間 ── */
  async function ping() {
    const s = [];
    try {
      await fetch('/api/meta?w=1', { cache: 'no-store' }).then((r) => r.arrayBuffer());
    } catch {}

    for (let i = 0; i < CFG.PING_N; i++) {
      const t = performance.now();
      try {
        await fetch('/api/meta?r=' + Math.random(), { cache: 'no-store' }).then((r) => r.arrayBuffer());
      } catch { continue; }
      s.push(performance.now() - t);
    }
    if (!s.length) return { ping: 0, jitter: 0 };

    const sorted = [...s].sort((a, b) => a - b);
    let d = 0;
    for (let i = 1; i < s.length; i++) d += Math.abs(s[i] - s[i - 1]);

    return {
      ping: sorted[Math.floor(sorted.length / 2)],
      jitter: s.length > 1 ? d / (s.length - 1) : 0,
    };
  }

  /* ── 下り ── */
  async function download(onTick) {
    const ac = new AbortController();
    let bytes = 0;
    let warmBytes = null;
    let warmAt = null;
    const t0 = performance.now();

    const timer = setInterval(() => {
      const el = performance.now() - t0;
      if (warmBytes === null && el >= CFG.DOWN_WARMUP) {
        warmBytes = bytes;
        warmAt = el;
      }
      onTick(mbps(bytes, el), Math.min(el / CFG.DOWN_MS, 1));
    }, 110);

    const runner = async () => {
      while (!ac.signal.aborted) {
        try {
          const res = await fetch(`/api/down?bytes=${CFG.DOWN_CHUNK}&r=${Math.random()}`, {
            cache: 'no-store',
            signal: ac.signal,
          });
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
          }
        } catch { return; }
      }
    };

    const all = Array.from({ length: CFG.DOWN_STREAMS }, () => runner());
    await sleep(CFG.DOWN_MS);
    ac.abort();
    clearInterval(timer);
    await Promise.allSettled(all);

    const el = performance.now() - t0;
    if (warmBytes !== null && el - warmAt > 1000) return mbps(bytes - warmBytes, el - warmAt);
    return mbps(bytes, el);
  }

  /* ── 上り ── */
  async function upload(onTick) {
    // crypto.getRandomValues は一度に 64KB までなので、ブロックを並べて必要量にする
    const block = crypto.getRandomValues(new Uint8Array(65536));
    const payload = new Blob(new Array(Math.max(1, Math.round(CFG.UP_CHUNK / 65536))).fill(block));

    let bytes = 0;
    let stop = false;
    const live = new Set();
    const t0 = performance.now();

    const timer = setInterval(() => {
      const el = performance.now() - t0;
      onTick(mbps(bytes, el), Math.min(el / CFG.UP_MS, 1));
    }, 110);

    const runner = () =>
      new Promise((resolve) => {
        const next = () => {
          if (stop) return resolve();
          const xhr = new XMLHttpRequest();
          live.add(xhr);
          let last = 0;
          xhr.open('POST', '/api/up?r=' + Math.random());
          xhr.upload.onprogress = (e) => {
            bytes += e.loaded - last;
            last = e.loaded;
          };
          xhr.onloadend = () => {
            live.delete(xhr);
            if (stop) resolve();
            else next();
          };
          xhr.send(payload);
        };
        next();
      });

    const all = Array.from({ length: CFG.UP_STREAMS }, () => runner());
    await sleep(CFG.UP_MS);
    stop = true;
    live.forEach((x) => { try { x.abort(); } catch {} });
    clearInterval(timer);
    await Promise.allSettled(all);

    return mbps(bytes, performance.now() - t0);
  }

  /* ── 一気通貫 ──
     どこかで失敗しても止まらず、取れた分だけ返す */
  async function run(cb) {
    const out = { meta: null, down: 0, up: 0, ping: 0, jitter: 0 };
    const say = (s) => cb.onStage && cb.onStage(s);
    const bar = (p) => cb.onProgress && cb.onProgress(p);

    say('接続を確認しています');
    out.meta = await meta();
    if (cb.onMeta) cb.onMeta(out.meta);

    try {
      say('応答速度を測っています');
      const p = await ping();
      out.ping = p.ping;
      out.jitter = p.jitter;
      if (cb.onPing) cb.onPing(out.ping, out.jitter);
    } catch (e) { console.error('ping', e); }

    try {
      say('ダウンロード速度を測っています');
      out.down = await download((v, p) => {
        if (cb.onDown) cb.onDown(v);
        bar(p * 0.6);
      });
      if (cb.onDown) cb.onDown(out.down);
    } catch (e) { console.error('download', e); }

    try {
      say('アップロード速度を測っています');
      out.up = await upload((v, p) => {
        if (cb.onUp) cb.onUp(v);
        bar(0.6 + p * 0.4);
      });
      if (cb.onUp) cb.onUp(out.up);
    } catch (e) { console.error('upload', e); }

    bar(1);
    say('測定が終わりました');
    return out;
  }

  return { run, meta, CFG };
})();
