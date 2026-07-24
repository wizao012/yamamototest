/* ============================================================
   ネット乗り換えの窓口 — 速度不満のバナーから来た人向け（/speed/）
   構成: 速度計測（任意） → 現在の回線 → こだわり → 結果 → フォーム
   ============================================================ */

const stage = document.getElementById('stage');
const state = { speed: null, current: null, prefs: [], step: 0 };

const CURRENT = [
  ['hikari', '光回線'],
  ['router', 'ホームルーター（置くだけ）'],
  ['pocket', 'ポケットWiFi・モバイルルーター'],
  ['catv', 'ケーブルテレビ'],
  ['unknown', 'わからない'],
];

const PREFS = [
  ['nowork', '工事はしたくない'],
  ['cheap', '料金も下げたい'],
  ['fast', 'とにかく速くしたい'],
  ['setwari', 'スマホとセットにしたい'],
  ['soon', 'すぐに使い始めたい'],
  ['none', '特にこだわりはない'],
];

const LABEL = {
  hikari: '光回線', router: 'ホームルーター', pocket: 'ポケットWiFi',
  catv: 'ケーブルテレビ', unknown: '現在の回線',
};

/* ── 特典 ★金額・条件は仮です。実際のものに差し替えてください ── */
const OFFERS = {
  hikari: {
    head: 'ご回答いただいた方限定<br>光回線へ乗り換える方へ',
    label: '最大特典総額',
    amount: '75,000',
    note: '※ 違約金の補填は上限60,000円です。証明書のご提出が必要です',
    perks: [
      '<b>他社の違約金・撤去費用を全額補填</b>　最大60,000円まで負担します',
      '<b>乗り換え限定の上乗せ還元 15,000円</b>　通常特典に追加されます',
      '<b>開通工事費が実質無料</b>　乗り換え時の初期費用をなくします',
      '<b>切り替えは1日で完了</b>　ネットが使えない期間はありません',
    ],
  },
  router: {
    head: 'ご回答いただいた方限定<br>工事不要タイプをご希望の方へ',
    label: '最大特典総額',
    amount: '60,000',
    note: '※ 違約金の補填は上限40,000円です。証明書のご提出が必要です',
    perks: [
      '<b>他社の違約金を全額補填</b>　最大40,000円まで負担します',
      '<b>端末代金が実質0円</b>　初期費用ゼロで始められます',
      '<b>工事も立ち会いも不要</b>　コンセントに挿すだけで使えます',
      '<b>最短で翌日に発送</b>　届いたその日から使えます',
    ],
  },
};

function offerHTML(key, noteOverride) {
  const o = OFFERS[key];
  return '<div class="offer"><div class="offer__head">' + o.head + '</div>' +
    '<div class="offer__body"><p class="offer__label">' + o.label + '</p>' +
    '<p class="offer__price"><span class="offer__num">' + o.amount + '</span><span class="offer__yen">円</span></p>' +
    '<p class="offer__note">' + (noteOverride || o.note) + '</p>' +
    '<ul class="perks">' + o.perks.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
    '</div></div>';
}

/* 工事を避けたい人にはホームルーター側の特典を出す */
function offerKey() {
  return state.prefs.includes('nowork') ? 'router' : 'hikari';
}

function paint(html) {
  stage.innerHTML = html;
  const card = stage.querySelector('.card');
  if (card) card.classList.add('card--enter');
}

const bar = (p) => `
  <div class="prog">
    <div class="prog__track"><div class="prog__fill" style="width:${p}%"></div></div>
  </div>`;

/* ============================================================
   1. 速度計測（任意）
   ============================================================ */

function renderIntro() {
  paint(`
    <section class="card">
      <h2 class="q__title">まず、いまの速度を測ってみませんか？</h2>
      <p class="q__hint">
        遅さの原因が回線側にあるのか、宅内のWi-Fi側にあるのかで、打つべき手がまったく変わります。
        測っておくと、このあとのご案内が具体的になります。
      </p>
      <button type="button" class="btn" id="go">速度を測る（約15秒）</button>
      <button type="button" class="btn btn--sub" id="skip">測らずに進む</button>
    </section>`);

  document.getElementById('go').addEventListener('click', runMeasure);
  document.getElementById('skip').addEventListener('click', renderCurrent);
}

async function runMeasure() {
  paint(`
    <section class="card">
      <div class="prog"><div class="prog__track"><div class="prog__fill" id="mbar"></div></div></div>
      <div class="meter">
        <p class="meter__stage" id="mstage">準備しています</p>
        <div class="meter__main">
          <p class="meter__label">ダウンロード速度</p>
          <p class="meter__value">
            <span class="meter__num" id="mdown">0.0</span><span class="meter__unit">Mbps</span>
          </p>
        </div>
        <dl class="meter__subs">
          <div><dt>アップロード</dt><dd id="mup">—<span>Mbps</span></dd></div>
          <div><dt>応答</dt><dd id="mping">—<span>ms</span></dd></div>
          <div><dt>ゆらぎ</dt><dd id="mjit">—<span>ms</span></dd></div>
        </dl>
        <p class="meter__wire" id="mwire"></p>
      </div>
      <div id="mdone" hidden>
        <button type="button" class="btn" id="mnext">この結果をもとに改善策を見る</button>
      </div>
    </section>`);

  const $ = (id) => document.getElementById(id);

  state.speed = await window.Measure.run({
    onStage: (s) => ($('mstage').textContent = s),
    onProgress: (p) => ($('mbar').style.width = (p * 100).toFixed(1) + '%'),
    onDown: (v) => ($('mdown').textContent = v.toFixed(1)),
    onUp: (v) => ($('mup').innerHTML = v.toFixed(1) + '<span>Mbps</span>'),
    onPing: (p, j) => {
      $('mping').innerHTML = p.toFixed(0) + '<span>ms</span>';
      $('mjit').innerHTML = j.toFixed(1) + '<span>ms</span>';
    },
    onMeta: (m) => {
      const t = { fixed: '固定回線（自宅のWi-Fiなど）', mobile: '携帯回線', unknown: '判別できませんでした' }[m.connection];
      $('mwire').textContent = `接続元：${m.asOrg || '不明'}　／　${t}`;
    },
  });

  $('mdone').hidden = false;
  $('mnext').addEventListener('click', renderCurrent);
}

/* ============================================================
   2. 現在の回線
   ============================================================ */

function renderCurrent() {
  paint(`
    <section class="card">
      ${bar(50)}
      <h2 class="q__title">いま何をお使いですか？</h2>
      <div style="height:12px"></div>
      <div class="choices">
        ${CURRENT.map(([v, t]) => `
          <button type="button" class="choice${state.current === v ? ' is-on' : ''}" data-v="${v}">
            <span class="choice__tick"></span><span>${t}</span>
          </button>`).join('')}
      </div>
      <button type="button" class="q__back">← 最初に戻る</button>
    </section>`);

  stage.querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => {
      stage.querySelectorAll('.choice').forEach((o) => o.classList.remove('is-on'));
      b.classList.add('is-on');
      state.current = b.dataset.v;
      setTimeout(renderPrefs, 220);
    });
  });
  stage.querySelector('.q__back').addEventListener('click', renderIntro);
}

/* ============================================================
   3. こだわり（複数選択）
   ============================================================ */

function renderPrefs() {
  paint(`
    <section class="card">
      ${bar(100)}
      <h2 class="q__title">乗り換えるとしたら、こだわりはありますか？</h2>
      <p class="q__hint">あてはまるものをすべて選んでください（複数可）</p>
      <div class="choices">
        ${PREFS.map(([v, t]) => `
          <button type="button" class="choice${state.prefs.includes(v) ? ' is-on' : ''}" data-v="${v}">
            <span class="choice__tick"></span><span>${t}</span>
          </button>`).join('')}
      </div>
      <div style="height:16px"></div>
      <button type="button" class="btn" id="next">この条件で改善策を見る</button>
      <button type="button" class="q__back">← ひとつ戻る</button>
    </section>`);

  stage.querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.v;
      if (v === 'none') {
        // 「特にこだわりはない」は排他
        state.prefs = state.prefs.includes('none') ? [] : ['none'];
      } else {
        state.prefs = state.prefs.filter((x) => x !== 'none');
        state.prefs = state.prefs.includes(v)
          ? state.prefs.filter((x) => x !== v)
          : [...state.prefs, v];
      }
      renderPrefs();
    });
  });

  document.getElementById('next').addEventListener('click', renderResult);
  stage.querySelector('.q__back').addEventListener('click', renderCurrent);
}

/* ============================================================
   4. 結果
   ============================================================ */

function diagnose() {
  const s = state.speed;
  const has = (p) => state.prefs.includes(p);
  const name = LABEL[state.current] || '現在の回線';

  const measured = !!s;
  const down = measured ? s.down : 0;
  const mobile = measured && s.meta && s.meta.connection === 'mobile';
  const slow = measured && down < 80;
  const laggy = measured && (s.ping > 50 || s.jitter > 20);
  const fig = measured ? `実測は下り ${down.toFixed(0)}Mbps、応答 ${s.ping.toFixed(0)}ms でした。` : '';

  const R = (n, w, top) => ({ name: n, why: w, top: !!top });
  const setwari = has('setwari') ? 'お使いのスマホとのセット割が適用できるものをお選びします。' : '';

  // 携帯回線から計測している
  if (mobile) {
    return {
      tone: 'ok',
      verdict: '携帯回線での計測です',
      finding:
        `いまは携帯回線で接続されているため、この数値はご自宅のWi-Fiの実力ではありません。` +
        `ただし ${down.toFixed(0)}Mbps 出ているということは、この場所の電波が十分に強いということです。` +
        `工事のいらない据置型で、自宅の回線を置き換えられる可能性があります。`,
      recos: [
        R('ホームルーター（工事不要）', `コンセントに挿すだけで使えます。この電波環境なら実用的な速度が期待できます。${setwari}`, true),
        R('自宅のWi-Fiで再測定', 'ご帰宅後にこのページをもう一度開くと、いまの回線との正確な比較ができます。'),
      ],
    };
  }

  // 工事したくない
  if (has('nowork')) {
    return {
      tone: 'warn',
      verdict: '工事なしで改善できます',
      finding:
        `工事は避けたいとのことなので、光回線は候補から外します。${fig}` +
        `${name}をお使いの環境でも、機器の入れ替えだけで改善できる余地があります。`,
      recos: [
        R('ホームルーター（工事不要）', `5G対応の最新モデルです。届いたその日から使えます。${setwari}`, true),
        R('Wi-Fiルーター・中継機の見直し', '回線はそのままに、電波の届きにくい部屋を改善する方法です。費用は最小で済みます。'),
      ],
    };
  }

  // 光をお使い
  if (state.current === 'hikari') {
    if (measured && !slow && !laggy) {
      return {
        tone: 'ok',
        verdict: '回線そのものは問題ありません',
        finding:
          `${fig}光回線としては十分な数値です。体感が悪い原因は回線ではなく、` +
          `宅内のWi-Fi環境にある可能性が高いと考えられます。ルーターの世代が古い、設置場所が悪い、といったケースがほとんどです。`,
        recos: [
          R('Wi-Fiルーターの見直し', '回線が速くてもルーターが古いと頭打ちになります。もっとも費用対効果の高い改善策です。', true),
          R('プランの見直し', `速度は保ったまま、月額を下げられる場合があります。${setwari}`),
        ],
      };
    }
    return {
      tone: 'warn',
      verdict: '接続方式が古い可能性があります',
      finding:
        `${fig}光回線で速度が出ない場合、回線そのものより、IPv6（IPoE）という新しい接続方式が有効になっていないケースが多くあります。` +
        `古い方式のままだと、夜間など混み合う時間帯に大きく落ち込みます。`,
      recos: [
        R('IPv6対応プランへの変更', `接続方式を切り替えるだけで改善する例が多く、事業者変更なら工事不要で済むこともあります。${setwari}`, true),
        R('IPv6対応ルーターへの交換', 'すでに対応済みのご契約なら、ルーター側が原因です。まずここを確認します。'),
      ],
    };
  }

  // ホームルーター・ポケットWiFi・ケーブルテレビ・不明
  return {
    tone: 'warn',
    verdict: '光回線への切り替えが有効です',
    finding:
      `${fig}${name}から光回線に変えると、速度・安定性・同時接続の余裕がいずれも改善します。` +
      (state.current === 'catv'
        ? 'ケーブルテレビはアップロードが細い構造のため、オンライン会議や動画投稿では特に差が出ます。'
        : '') +
      (has('cheap') ? '月額についても、セット割の適用で下がる場合があります。' : ''),
    recos: [
      R('光回線', `速度・安定性ともに現状を上回ります。${setwari || '住所を確認のうえ、対応可能なものをご案内します。'}`, true),
      R('ホームルーター（工事不要）', '工事の日程がすぐ取れない場合の次善策です。開通までのつなぎにもなります。'),
    ],
  };
}

function renderResult() {
  const d = diagnose();
  paint(`
    <section class="card">
      <span class="verdict verdict--${d.tone}">${d.verdict}</span>
      <p class="finding">${d.finding}</p>
      <ul class="recos">
        ${d.recos.map((r) => `
          <li class="reco${r.top ? ' reco--top' : ''}">
            ${r.top ? '<span class="reco__tag">いちばんのおすすめ</span>' : ''}
            <h3 class="reco__name">${r.name}</h3>
            <p class="reco__why">${r.why}</p>
          </li>`).join('')}
      </ul>
      ${offerHTML(offerKey())}
      <button type="button" class="btn" id="toform">この特典で無料見積もりを受け取る</button>
      ${!state.speed ? '<button type="button" class="btn btn--sub" id="also">やっぱり速度を測ってみる</button>' : ''}
      <ul class="assure">
        <li>ご相談も見積もりも無料です。その場でご契約いただく必要はありません。</li>
        <li>ご提供エリアと建物の設備状況を確認したうえで、正確な金額をお伝えします。</li>
        <li>ご連絡は1回のみです。お断りいただいた後に、こちらから再度ご連絡することはありません。</li>
      </ul>
      <button type="button" class="q__back">← 条件を選び直す</button>
    </section>`);

  document.getElementById('toform').addEventListener('click', renderForm);
  stage.querySelector('.q__back').addEventListener('click', renderPrefs);
  const also = document.getElementById('also');
  if (also) also.addEventListener('click', runMeasure);
}

/* ============================================================
   5. フォーム（提案用のため送信・保存はしません）
   ============================================================ */

function renderForm() {
  paint(`
    <section class="card">
      ${offerHTML(offerKey(), 'ご入力いただくと、適用できる正確な金額を無料で試算します')}
      <label class="field"><span>お名前</span>
        <input type="text" id="f-name" autocomplete="name" placeholder="鈴木 太郎"></label>
      <label class="field"><span>電話番号</span>
        <input type="tel" id="f-tel" autocomplete="tel" inputmode="tel" placeholder="09012345678"></label>
      <label class="field"><span>メールアドレス（任意）</span>
        <input type="email" id="f-mail" autocomplete="email" inputmode="email" placeholder="taro@example.com"></label>
      <button type="button" class="btn" id="send">無料で試算を受け取る</button>
      <p class="err" id="err" hidden></p>
      <p class="closing">入力は30秒。しつこい勧誘は一切ありません。</p>
      <p class="consent">
        ご入力いただいた内容は、ご案内の目的でのみ使用します。ご希望があればいつでも削除できます。
      </p>
      <button type="button" class="q__back">← 結果に戻る</button>
    </section>`);

  stage.querySelector('.q__back').addEventListener('click', renderResult);

  document.getElementById('send').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    const tel = document.getElementById('f-tel').value.trim();
    const mail = document.getElementById('f-mail').value.trim();
    const err = document.getElementById('err');

    if (!name) {
      err.textContent = 'お名前を入力してください。';
      err.hidden = false;
      document.getElementById('f-name').focus();
      return;
    }
    if (!tel && !mail) {
      err.textContent = '電話番号かメールアドレスのどちらかを入力してください。';
      err.hidden = false;
      document.getElementById('f-tel').focus();
      return;
    }

    console.log('LEAD (送信なし)', { name, tel, mail, current: state.current, prefs: state.prefs, speed: state.speed });

    paint(`
      <section class="card">
        <div class="thanks">
          <div class="thanks__mark"></div>
          <h2 class="thanks__title">受け付けました</h2>
          <p class="thanks__body">
            担当者より、1営業日以内にご連絡します。<br>
            お急ぎの場合はお電話でも承ります。
          </p>
        </div>
      </section>`);
  });
}

/* ── 起動 ── */
renderIntro();
