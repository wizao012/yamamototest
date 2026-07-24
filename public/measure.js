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

/* ============================================================
   用途別の判定表（共通）
   window.Judge.html(計測結果) で判定表のHTMLを返す

   判定の考え方:
     各用途に必要な 下り / 上り / 応答 / ゆらぎ の目安を定め、
     もっとも足りていない項目でその用途の判定を決めます。
       目安を満たす      → 快適
       目安の6割以上     → やや不安
       目安の6割未満     → 厳しい
   ============================================================ */

window.Judge = (function () {
  const ICON = {
    web:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/></svg>',
    game: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 10v4M5 12h4"/><circle cx="16.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13.5" r="1" fill="currentColor" stroke="none"/></svg>',
    work: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg>',
  };

  /* down/up は Mbps、ping/jitter は ms（小さいほうがよい） */
  const GROUPS = [
    { name: 'Webサービス', icon: 'web', items: [
      { label: 'Webサイト閲覧',   down: 5 },
      { label: 'SNS利用',         down: 10 },
      { label: 'ビデオ通話',      down: 5,  up: 3,  ping: 100, jitter: 40 },
    ]},
    { name: '動画視聴', icon: 'play', items: [
      { label: '標準画質（480p）', down: 3 },
      { label: 'フルHD（1080p）',  down: 8 },
      { label: '4K画質',           down: 35 },
    ]},
    { name: 'ゲーム', icon: 'game', items: [
      { label: 'オンラインゲーム',   down: 30, ping: 50,  jitter: 20 },
      { label: 'スマホアプリゲーム', down: 10, ping: 80,  jitter: 30 },
    ]},
    { name: '仕事・在宅ワーク', icon: 'work', items: [
      { label: 'メール・チャット',     down: 2 },
      { label: 'ビデオ会議',           down: 8,   up: 5,  ping: 80, jitter: 30 },
      { label: 'クラウドへの同期',     down: 10,  up: 10 },
      { label: '大容量ファイルの送信', down: 100, up: 30 },
    ]},
  ];

  const LABEL = { 3: '快適', 2: 'やや不安', 1: '厳しい' };

  function level(item, s) {
    let worst = 3;
    const hi = (val, need) => {
      if (need == null) return;
      const r = need > 0 ? val / need : 1;
      worst = Math.min(worst, r >= 1 ? 3 : r >= 0.6 ? 2 : 1);
    };
    const lo = (val, need) => {
      if (need == null) return;
      const r = need / Math.max(val, 0.1);
      worst = Math.min(worst, r >= 1 ? 3 : r >= 0.6 ? 2 : 1);
    };
    hi(s.down, item.down);
    hi(s.up, item.up);
    lo(s.ping, item.ping);
    lo(s.jitter, item.jitter);
    return worst;
  }

  function html(s) {
    if (!s) return '';

    let bad = 0, warn = 0, total = 0;
    const groups = GROUPS.map(function (g) {
      const rows = g.items.map(function (it) {
        const lv = level(it, s);
        total++;
        if (lv === 1) bad++;
        else if (lv === 2) warn++;
        return '<div class="judge__row"><span class="judge__name">' + it.label + '</span>' +
          '<span class="judge__pill judge__pill--' + lv + '">' + LABEL[lv] + '</span></div>';
      }).join('');

      return '<div class="judge__group"><div class="judge__head">' + ICON[g.icon] +
        '<span>' + g.name + '</span></div>' + rows + '</div>';
    }).join('');

    /* 見出しは実測にもとづいて出し分ける */
    let lead;
    if (bad > 0) {
      lead = '<em>' + bad + '項目</em>で、いまの回線では厳しい結果が出ています。' +
        (warn > 0 ? 'さらに' + warn + '項目が不安定な水準です。' : '') +
        '改善できる可能性があります。';
    } else if (warn > 0) {
      lead = '大きな問題はありませんが、<em>' + warn + '項目</em>で余裕が足りていません。' +
        '同時に複数の機器を使うと不安定になりやすい状態です。';
    } else {
      lead = 'すべての用途で<em>快適</em>な水準です。速度面での不満は、回線ではなく' +
        '宅内のWi-Fi機器が原因の可能性があります。';
    }

    const mobile = s.meta && s.meta.connection === 'mobile';

    return '<div class="judge">' +
      '<p class="judge__lead">' + lead + '</p>' +
      '<div class="judge__grid">' + groups + '</div>' +
      '<p class="judge__note">' +
      (mobile ? '※ 現在は携帯回線で接続されているため、この判定はご自宅のWi-Fi環境のものではありません。<br>' : '') +
      '※ 判定は一般的な推奨値との比較による目安です。実際の体感は、接続する機器の台数や時間帯によって変わります。' +
      '</p></div>';
  }

  return { html: html, GROUPS: GROUPS };
})();
