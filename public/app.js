/* ============================================================
   通信速度検査票 — 計測 / 聞き取り / 所見
   ============================================================ */

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mbps = (bytes, ms) => (ms <= 0 ? 0 : (bytes * 8) / (ms / 1000) / 1e6);

const state = {
  meta: null,
  down: 0,
  up: 0,
  ping: 0,
  jitter: 0,
  answers: {},
  result: null,
};

/* ── 計測パラメータ ──────────────────────────────
   テスト中は短めに。数字が安定しないようなら DOWN_MS を伸ばす。 */
const CFG = {
  DOWN_MS: 9000,
  DOWN_STREAMS: 6,
  DOWN_WARMUP: 1800,   // TCP の立ち上がりを除外する時間
  DOWN_CHUNK: 25 * 1024 * 1024,
  UP_MS: 7000,
  UP_STREAMS: 4,
  UP_CHUNK: 4 * 1024 * 1024,
  PING_N: 14,
};

/* ============================================================
   1. 接続元の確認
   ============================================================ */

async function loadMeta() {
  try {
    const res = await fetch('/api/meta?r=' + Math.random(), { cache: 'no-store' });
    state.meta = await res.json();
  } catch {
    state.meta = { connection: 'unknown', asOrg: '', colo: '' };
  }

  const m = state.meta;
  $('asorg').textContent = m.asOrg || '取得できませんでした';
  $('colo').textContent = m.colo ? `${m.colo}${m.city ? ' / ' + m.city : ''}` : '—';
  $('conntype').textContent = {
    fixed: '固定回線（自宅Wi-Fiなど）',
    mobile: '携帯回線',
    unknown: '判別できませんでした',
  }[m.connection];
}

/* ============================================================
   2. 応答時間
   ============================================================ */

async function measurePing() {
  const samples = [];
  // 1回目は接続確立を含むので捨てる
  try { await fetch('/api/meta?w=1', { cache: 'no-store' }).then((r) => r.arrayBuffer()); } catch {}

  for (let i = 0; i < CFG.PING_N; i++) {
    const t = performance.now();
    try {
      await fetch('/api/meta?r=' + Math.random(), { cache: 'no-store' }).then((r) => r.arrayBuffer());
    } catch { continue; }
    samples.push(performance.now() - t);
  }
  if (!samples.length) return { ping: 0, jitter: 0 };

  const sorted = [...samples].sort((a, b) => a - b);
  const ping = sorted[Math.floor(sorted.length / 2)];

  let diff = 0;
  for (let i = 1; i < samples.length; i++) diff += Math.abs(samples[i] - samples[i - 1]);
  const jitter = samples.length > 1 ? diff / (samples.length - 1) : 0;

  return { ping, jitter };
}

/* ============================================================
   3. 下り
   ============================================================ */

async function measureDownload(onTick) {
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
  }, 120);

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

  const all = Array.from({ length: CFG.DOWN_STREAMS }, runner);
  await sleep(CFG.DOWN_MS);
  ac.abort();
  clearInterval(timer);
  await Promise.allSettled(all);

  const el = performance.now() - t0;
  if (warmBytes !== null && el - warmAt > 1000) return mbps(bytes - warmBytes, el - warmAt);
  return mbps(bytes, el);
}

/* ============================================================
   4. 上り
   ============================================================ */

async function measureUpload(onTick) {
  const payload = new Blob([crypto.getRandomValues(new Uint8Array(CFG.UP_CHUNK))]);
  let bytes = 0;
  let stop = false;
  const t0 = performance.now();

  const timer = setInterval(() => {
    const el = performance.now() - t0;
    onTick(mbps(bytes, el), Math.min(el / CFG.UP_MS, 1));
  }, 120);

  const runner = () =>
    new Promise((resolve) => {
      const next = () => {
        if (stop) return resolve();
        const xhr = new XMLHttpRequest();
        let last = 0;
        xhr.open('POST', '/api/up?r=' + Math.random());
        // fetch には送信側の進捗が無いので、上りだけ XHR を使う
        xhr.upload.onprogress = (e) => {
          bytes += e.loaded - last;
          last = e.loaded;
        };
        xhr.onloadend = () => (stop ? resolve() : next());
        xhr.onerror = () => resolve();
        xhr.send(payload);
      };
      next();
    });

  const all = Array.from({ length: CFG.UP_STREAMS }, runner);
  await sleep(CFG.UP_MS);
  stop = true;
  clearInterval(timer);
  await Promise.allSettled(all);

  return mbps(bytes, performance.now() - t0);
}

/* ============================================================
   5. 計測の進行
   ============================================================ */

function setNum(id, v, digits = 1) {
  $(id).textContent = v.toFixed(digits);
}

async function runMeasurement() {
  $('remeasure').hidden = true;
  $('stamp').classList.remove('is-pressed');
  $('bar').style.width = '0%';
  ['down', 'up', 'ping', 'jitter'].forEach((k) => ($(k).textContent = k === 'down' ? '0.0' : '—'));

  await loadMeta();

  $('stage').textContent = '応答時間を測定中';
  const { ping, jitter } = await measurePing();
  state.ping = ping;
  state.jitter = jitter;
  setNum('ping', ping, 0);
  setNum('jitter', jitter, 1);

  $('stage').textContent = '下り速度を測定中';
  state.down = await measureDownload((v, p) => {
    setNum('down', v);
    $('bar').style.width = (p * 55).toFixed(1) + '%';
  });
  setNum('down', state.down);

  $('stage').textContent = '上り速度を測定中';
  state.up = await measureUpload((v, p) => {
    setNum('up', v);
    $('bar').style.width = (55 + p * 45).toFixed(1) + '%';
  });
  setNum('up', state.up);

  $('bar').style.width = '100%';
  $('stage').textContent = '測定完了';
  $('remeasure').hidden = false;

  pressStamp();
  showQuiz();
}

function pressStamp() {
  const conn = state.meta?.connection;
  let verdict;
  if (conn === 'mobile') verdict = '携帯回線';
  else if (state.down < 80 || state.ping > 50) verdict = '要改善';
  else if (state.down < 250) verdict = '概ね良好';
  else verdict = '良好';

  $('verdict').textContent = verdict;
  requestAnimationFrame(() => $('stamp').classList.add('is-pressed'));
}

/* ============================================================
   6. 聞き取り
   ============================================================ */

const QUESTIONS = [
  {
    key: 'current',
    no: '一',
    label: 'いま使っている回線は？',
    opts: [
      ['hikari', '光回線'],
      ['router', 'ホームルーター・WiMAX'],
      ['catv', 'ケーブルテレビ'],
      ['unknown', 'わからない'],
    ],
  },
  {
    key: 'construction',
    no: '二',
    label: '開通工事はできますか？',
    opts: [
      ['ok', 'できる'],
      ['ng', 'したくない・できない'],
    ],
  },
  {
    key: 'pain',
    no: '三',
    label: 'いちばん困っているのは？',
    opts: [
      ['video', '動画が止まる'],
      ['meeting', 'オンライン会議'],
      ['game', 'ゲームの反応'],
      ['price', '料金が高い'],
    ],
  },
  {
    key: 'carrier',
    no: '四',
    label: 'お使いのスマホは？',
    opts: [
      ['docomo', 'ドコモ'],
      ['au', 'au / UQ'],
      ['sb', 'ソフトバンク / ワイモバイル'],
      ['other', 'その他・格安SIM'],
    ],
  },
];

function showQuiz() {
  const wrap = $('quiz');
  if (wrap.dataset.built) {
    $('panel-quiz').hidden = false;
    return;
  }
  wrap.dataset.built = '1';

  QUESTIONS.forEach((q) => {
    const div = document.createElement('div');
    div.className = 'q';
    div.innerHTML = `<p class="q__label"><span class="q__no">${q.no}</span>${q.label}</p>`;

    const opts = document.createElement('div');
    opts.className = 'opts';
    q.opts.forEach(([val, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = text;
      b.onclick = () => {
        opts.querySelectorAll('.opt').forEach((o) => o.classList.remove('is-on'));
        b.classList.add('is-on');
        state.answers[q.key] = val;
        if (Object.keys(state.answers).length === QUESTIONS.length) showResult();
      };
      opts.appendChild(b);
    });

    div.appendChild(opts);
    wrap.appendChild(div);
  });

  $('panel-quiz').hidden = false;
  $('panel-quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   7. 所見（提案ロジック）
   商材名は御社の取扱に合わせて差し替えてください
   ============================================================ */

const HIKARI = {
  docomo: 'ドコモ光',
  au: 'auひかり',
  sb: 'SoftBank 光',
  other: 'NURO 光',
};
const HOMEROUTER = {
  docomo: 'home 5G',
  au: 'au ホームルーター 5G',
  sb: 'SoftBank Air',
  other: 'SoftBank Air',
};

function diagnose() {
  const a = state.answers;
  const conn = state.meta?.connection ?? 'unknown';
  const carrier = a.carrier ?? 'other';
  const d = state.down;
  const cards = [];
  let finding;

  /* ── 携帯回線から計測している場合 ───────────── */
  if (conn === 'mobile') {
    finding =
      `携帯回線での計測のため、この数値はご自宅のWi-Fiの実力ではありません。` +
      `ただし ${d.toFixed(0)}Mbps という数字は、この場所の電波が十分に強いことを示しています。` +
      `工事のいらない据置型で、固定回線を置き換えられる可能性があります。`;
    cards.push({
      name: HOMEROUTER[carrier],
      why: `コンセントに挿すだけで開通します。この電波環境なら実用速度が期待できます。${
        carrier === 'other' ? '' : 'スマホとのセット割も適用対象です。'
      }`,
    });
    if (a.construction === 'ok') {
      cards.push({
        name: HIKARI[carrier],
        why: '工事が可能とのことなので、速度と安定性を最優先するならこちらです。',
      });
    }
    cards.push({
      name: 'ご自宅のWi-Fiで再検査',
      why: '帰宅後にこのページをもう一度開いて計測すると、現在の回線との正確な比較ができます。',
    });
    return { finding, cards };
  }

  /* ── 固定回線から計測している場合 ───────────── */

  const slow = d < 80;
  const laggy = state.ping > 50 || state.jitter > 20;

  if (a.current === 'hikari' && (slow || laggy)) {
    finding =
      `光回線をお使いにもかかわらず、下り ${d.toFixed(0)}Mbps・応答 ${state.ping.toFixed(0)}ms という結果です。` +
      `これは回線そのものより、IPv6（IPoE）方式が有効になっていない場合に多く見られる数値です。` +
      `夜間に混雑する旧方式のままである可能性があります。`;
    cards.push({
      name: `${HIKARI[carrier]}（IPv6対応プラン）`,
      why: '接続方式を切り替えるだけで改善する例が多く、事業者変更なら工事不要で済むこともあります。',
    });
    cards.push({
      name: 'IPv6対応ルーターへの交換',
      why: 'ご契約が既にIPv6対応の場合、ルーター側が古いと速度が出ません。まずここを確認します。',
    });
  } else if (a.current === 'router' || a.current === 'catv') {
    if (a.construction === 'ng') {
      finding =
        `工事なしをご希望とのことなので、光回線は候補から外します。` +
        `現状の下り ${d.toFixed(0)}Mbps に対して、最新のホームルーターなら改善の余地があります。`;
      cards.push({
        name: HOMEROUTER[carrier],
        why: '5G対応の据置型です。工事不要で、届いた日から使えます。',
      });
      cards.push({
        name: 'Wi-Fi中継機の追加',
        why: '回線を変えずに、部屋の奥まで電波を届かせる方法です。費用は最小で済みます。',
      });
    } else {
      finding =
        `${a.current === 'catv' ? 'ケーブルテレビ回線' : 'ホームルーター'}をお使いですね。` +
        `下り ${d.toFixed(0)}Mbps・上り ${state.up.toFixed(0)}Mbps という結果で、` +
        `${a.pain === 'game' || a.pain === 'meeting' ? '特に応答速度の面で' : ''}` +
        `光回線に切り替える価値が見込めます。`;
      cards.push({
        name: HIKARI[carrier],
        why: `速度・応答ともに現状を上回ります。${
          carrier === 'other' ? '' : 'お使いのスマホとのセット割が使えます。'
        }`,
      });
      cards.push({
        name: HOMEROUTER[carrier],
        why: '工事の日程が取りにくい場合の次善策です。開通までのつなぎとしても使えます。',
      });
    }
  } else {
    finding =
      `下り ${d.toFixed(0)}Mbps・応答 ${state.ping.toFixed(0)}ms。` +
      `回線そのものは十分な速度が出ています。体感が悪いとすれば、` +
      `原因は回線ではなくWi-Fi機器か宅内の環境にある可能性が高いです。`;
    cards.push({
      name: 'Wi-Fiルーターの見直し',
      why: '回線が速くてもルーターが古いと頭打ちになります。まずここを確認するのが近道です。',
    });
    cards.push({
      name: `${HIKARI[carrier]}へのプラン見直し`,
      why:
        a.pain === 'price'
          ? 'スマホとのセット割を適用すると、同等の速度のまま月額を下げられる場合があります。'
          : '同等の速度のまま月額を見直せる場合があります。',
    });
  }

  return { finding, cards };
}

function showResult() {
  state.result = diagnose();
  $('finding').textContent = state.result.finding;

  const ul = $('cards');
  ul.innerHTML = '';
  state.result.cards.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML =
      `<p class="card__rank">候補 ${String(i + 1).padStart(2, '0')}</p>` +
      `<h3 class="card__name"></h3><p class="card__why"></p>`;
    li.querySelector('.card__name').textContent = c.name;
    li.querySelector('.card__why').textContent = c.why;
    ul.appendChild(li);
  });

  $('panel-result').hidden = false;
  $('panel-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   8. リード送信
   ============================================================ */

async function submitLead() {
  const name = $('f-name').value.trim();
  const contact = $('f-contact').value.trim();
  const err = $('f-error');

  if (!contact) {
    err.textContent = '連絡先を入力してください。メールアドレスか電話番号のどちらかで結構です。';
    err.hidden = false;
    $('f-contact').focus();
    return;
  }
  err.hidden = true;

  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = '送信しています';

  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        contact,
        answers: state.answers,
        result: {
          down: state.down,
          up: state.up,
          ping: state.ping,
          jitter: state.jitter,
          finding: state.result?.finding,
          cards: state.result?.cards.map((c) => c.name),
        },
      }),
    });
    if (!res.ok) throw new Error('failed');
    btn.textContent = '受け付けました';
    $('f-error').hidden = true;
  } catch {
    btn.disabled = false;
    btn.textContent = '試算を受け取る';
    err.textContent = '送信できませんでした。通信環境をご確認のうえ、もう一度お試しください。';
    err.hidden = false;
  }
}

/* ============================================================
   起動
   ============================================================ */

$('ticket').textContent = String(Date.now() % 100000).padStart(5, '0');
$('date').textContent = new Date().toLocaleDateString('ja-JP');
$('remeasure').addEventListener('click', runMeasurement);
$('submit').addEventListener('click', submitLead);

runMeasurement();
