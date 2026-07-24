/* ============================================================
   ネット乗り換えの窓口 — アンケート型LP
   先に回答してもらい、答えた方にだけ特典を開示する構成
   ※ 金額・特典はすべて仮です。OFFERS を実際の条件に差し替えてください。
   ============================================================ */

const stage = document.getElementById('stage');
const state = { answers: {}, speed: null, idx: 0, time: null };

/* ── プルダウンの選択肢 ──
   自社で扱っていないものも、認知度の高いものは載せています。
   「使っていない」を選んだ方が新規、それ以外が乗り換えの扱いになります。 */

const HIKARI_LIST = [
  ['none', 'いまは光回線を使っていない'],
  ['flets', 'フレッツ光'],
  ['docomo', 'ドコモ光'],
  ['sb', 'SoftBank光'],
  ['au', 'auひかり'],
  ['nuro', 'NURO光'],
  ['biglobe', 'BIGLOBE光'],
  ['sonet', 'So-net光'],
  ['ocn', 'OCN インターネット'],
  ['nifty', '@nifty光'],
  ['gmo', 'GMOとくとくBB光'],
  ['rakuten', '楽天ひかり'],
  ['eo', 'eo光'],
  ['commufa', 'コミュファ光'],
  ['pikara', 'ピカラ光'],
  ['bbiq', 'BBIQ'],
  ['megaegg', 'メガエッグ'],
  ['jcom', 'J:COM NET'],
  ['other', 'その他の光回線'],
  ['dunno', '契約先がわからない'],
];

const ROUTER_LIST = [
  ['none', 'いまはホームルーターを使っていない'],
  ['sbair', 'SoftBank Air'],
  ['home5g', 'ドコモ home 5G'],
  ['wimax', 'WiMAX（Speed Wi-Fi HOME）'],
  ['auhr', 'au ホームルーター 5G'],
  ['turbo', 'Rakuten Turbo'],
  ['pocket', 'ポケットWiFi・モバイルルーター'],
  ['other', 'その他のホームルーター'],
  ['dunno', '契約先がわからない'],
];

/* ============================================================
   質問
   ============================================================ */

const Q = {
  type: {
    kind: 'choice',
    title: 'ご検討中なのはどちらですか？',
    hint: '迷っている方は3つめをお選びください',
    opts: [
      ['hikari', '光回線　― 速度と安定性を重視'],
      ['router', 'ホームルーター　― 工事なしですぐ使いたい'],
      ['unsure', 'どちらがいいか分からない'],
    ],
  },
  focus: {
    kind: 'choice',
    title: 'いちばん重視されるのはどれですか？',
    opts: [
      ['price', '毎月の料金を下げたい'],
      ['speed', '速度を上げたい・遅さを解消したい'],
      ['nowork', '工事をしたくない'],
      ['benefit', 'キャッシュバックや特典を重視'],
      ['renew', '更新月や違約金が心配'],
    ],
  },
  place: {
    kind: 'choice',
    title: 'お住まいはどちらですか？',
    hint: 'ご提供できるプランと料金が変わります',
    opts: [['house', '戸建て'], ['apart', 'マンション・アパート']],
  },
  carrier: {
    kind: 'choice',
    title: 'お使いのスマホはどちらですか？',
    hint: 'セット割が使えるかの判定に使います',
    opts: [
      ['docomo', 'ドコモ'],
      ['au', 'au・UQモバイル'],
      ['sb', 'ソフトバンク・ワイモバイル'],
      ['rakuten', '楽天モバイル'],
      ['other', 'その他・格安SIM'],
    ],
  },
};

const CARRIER_LABEL = {
  docomo: 'ドコモ', au: 'au・UQ', sb: 'ソフトバンク・ワイモバイル',
  rakuten: '楽天モバイル', other: 'ご利用のスマホ',
};

/* 「いま何を使っているか」は1問目の回答で中身が変わる */
function nowQuestion() {
  const t = state.answers.type;
  if (t === 'hikari') {
    return {
      kind: 'select',
      title: 'いまお使いの光回線はどちらですか？',
      hint: '一覧にない場合は「その他の光回線」をお選びください',
      opts: HIKARI_LIST,
    };
  }
  if (t === 'router') {
    return {
      kind: 'select',
      title: 'いまお使いのホームルーターはどちらですか？',
      hint: '一覧にない場合は「その他」をお選びください',
      opts: ROUTER_LIST,
    };
  }
  return {
    kind: 'choice',
    title: 'いまのご利用状況に近いものは？',
    opts: [
      ['has_hikari', '光回線を使っている'],
      ['has_router', 'ホームルーター・ポケットWiFiを使っている'],
      ['has_catv', 'ケーブルテレビを使っている'],
      ['none', '使っていない（スマホのギガのみ）'],
    ],
  };
}

function sequence() {
  const s = ['type', 'now', 'focus'];
  if (state.answers.focus === 'speed') s.push('__speed');
  s.push('place', 'carrier');
  return s;
}

const countQ = (seq) => seq.filter((k) => k !== '__speed').length;

const isNew = () => state.answers.now === 'none';

function category() {
  const t = state.answers.type;
  if (t === 'hikari') return 'hikari';
  if (t === 'router') return 'router';
  if (state.answers.focus === 'nowork') return 'router';
  if (state.answers.now === 'has_router' && state.answers.focus === 'price') return 'router';
  return 'hikari';
}

/* ============================================================
   特典  ★ここの金額・条件を実際のものに差し替えてください
   ============================================================ */

const OFFERS = {
  hikari_new: {
    head: 'ご回答いただいた方限定<br>光回線を新規でお申し込みの方へ',
    label: '最大キャッシュバック',
    amount: '66,000',
    note: '※ 提携事業者・プラン・お申し込み時期により金額は変わります',
    perks: [
      '<b>開通工事費が実質無料</b>　月々の割引で相殺されます',
      '<b>開通までのWiFiを無料レンタル</b>　工事を待つ間もネットが使えます',
      '<b>事務手数料を全額還元</b>　初期費用の負担をなくします',
      '<b>スマホとのセット割を適用</b>　家族の台数分まとめて安くなります',
    ],
  },
  hikari_switch: {
    head: 'ご回答いただいた方限定<br>他社から光回線へ乗り換える方へ',
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
  router_new: {
    head: 'ご回答いただいた方限定<br>ホームルーターを新規でお申し込みの方へ',
    label: '最大キャッシュバック',
    amount: '30,000',
    note: '※ 端末代の実質無料は、所定期間のご利用が条件となります',
    perks: [
      '<b>端末代金が実質0円</b>　初期費用ゼロで始められます',
      '<b>工事も立ち会いも不要</b>　コンセントに挿すだけで使えます',
      '<b>最短で翌日に発送</b>　届いたその日から使えます',
      '<b>スマホとのセット割を適用</b>　月額をさらに抑えられます',
    ],
  },
  router_switch: {
    head: 'ご回答いただいた方限定<br>他社からホームルーターへ乗り換える方へ',
    label: '最大特典総額',
    amount: '60,000',
    note: '※ 違約金の補填は上限40,000円です。証明書のご提出が必要です',
    perks: [
      '<b>他社の違約金を全額補填</b>　最大40,000円まで負担します',
      '<b>乗り換え限定の上乗せ還元 20,000円</b>　通常特典に追加されます',
      '<b>端末代金が実質0円</b>　乗り換えの初期費用をなくします',
      '<b>工事も立ち会いも不要</b>　届いたその日から使えます',
    ],
  },
};

const offerKey = () => category() + '_' + (isNew() ? 'new' : 'switch');

/* ============================================================
   描画
   ============================================================ */

function paint(html) {
  stage.innerHTML = html;
  const c = stage.querySelector('.card');
  if (c) c.classList.add('card--enter');
}

function progressHTML() {
  const seq = sequence();
  const total = countQ(seq);
  const done = countQ(seq.slice(0, state.idx));
  const left = Math.max(total - done, 0);
  return '<div class="prog">' +
    '<div class="prog__track"><div class="prog__fill" style="width:' + (done / total) * 100 + '%"></div></div>' +
    '<div class="prog__meta"><span>質問 <b>' + Math.min(done + 1, total) + '</b> / ' + total + '</span>' +
    '<span>' + (left <= 1 ? 'あと少しで特典が表示されます' : '残り ' + left + ' 問') + '</span></div></div>';
}

function render() {
  const seq = sequence();
  if (state.idx >= seq.length) return renderResult();

  const key = seq[state.idx];
  if (key === '__speed') return renderSpeedOffer();

  const q = key === 'now' ? nowQuestion() : Q[key];
  const back = state.idx > 0 ? '<button type="button" class="q__back">← ひとつ戻る</button>' : '';

  if (q.kind === 'select') {
    const cur = state.answers[key] || '';
    paint(
      '<section class="card">' + progressHTML() +
      '<h2 class="q__title">' + q.title + '</h2>' +
      '<p class="q__hint">' + (q.hint || '') + '</p>' +
      '<select class="select" id="sel"><option value="">選択してください</option>' +
      q.opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') +
      '</select><div style="height:16px"></div>' +
      '<button type="button" class="btn" id="next"' + (cur ? '' : ' disabled') + '>次へ進む</button>' +
      back + '</section>'
    );

    const sel = document.getElementById('sel');
    const next = document.getElementById('next');
    sel.addEventListener('change', function () {
      state.answers[key] = sel.value;
      next.disabled = !sel.value;
    });
    next.addEventListener('click', function () { state.idx++; render(); });
  } else {
    paint(
      '<section class="card">' + progressHTML() +
      '<h2 class="q__title">' + q.title + '</h2>' +
      (q.hint ? '<p class="q__hint">' + q.hint + '</p>' : '<div style="height:12px"></div>') +
      '<div class="choices">' +
      q.opts.map(function (o) {
        return '<button type="button" class="choice' + (state.answers[key] === o[0] ? ' is-on' : '') +
          '" data-v="' + o[0] + '"><span class="choice__tick"></span><span>' + o[1] + '</span></button>';
      }).join('') +
      '</div>' + back + '</section>'
    );

    stage.querySelectorAll('.choice').forEach(function (b) {
      b.addEventListener('click', function () {
        stage.querySelectorAll('.choice').forEach(function (o) { o.classList.remove('is-on'); });
        b.classList.add('is-on');
        state.answers[key] = b.dataset.v;
        setTimeout(function () { state.idx++; render(); }, 220);
      });
    });
  }

  const bk = stage.querySelector('.q__back');
  if (bk) bk.addEventListener('click', function () { state.idx--; render(); });
}

/* ============================================================
   速度計測
   ============================================================ */

function renderSpeedOffer() {
  paint(
    '<section class="card">' + progressHTML() +
    '<h2 class="q__title">いまの速度を測ってみませんか？</h2>' +
    '<p class="q__hint">遅さの原因が回線側にあるのか、宅内のWi-Fi側にあるのかで、ご案内する内容が変わります。約15秒で終わります。</p>' +
    '<button type="button" class="btn" id="go">速度を測る</button>' +
    '<button type="button" class="btn btn--sub" id="skip">測らずに次へ進む</button>' +
    '<button type="button" class="q__back">← ひとつ戻る</button></section>'
  );

  document.getElementById('go').addEventListener('click', function () { runMeasure(); });
  document.getElementById('skip').addEventListener('click', function () { state.idx++; render(); });
  stage.querySelector('.q__back').addEventListener('click', function () { state.idx--; render(); });
}

async function runMeasure(after) {
  paint(
    '<section class="card">' +
    '<div class="prog"><div class="prog__track"><div class="prog__fill" id="mbar"></div></div></div>' +
    '<div class="meter"><p class="meter__stage" id="mstage">準備しています</p>' +
    '<div class="meter__main"><p class="meter__label">ダウンロード速度</p>' +
    '<p class="meter__value"><span class="meter__num" id="mdown">0.0</span><span class="meter__unit">Mbps</span></p></div>' +
    '<dl class="meter__subs">' +
    '<div><dt>アップロード</dt><dd id="mup">—<span>Mbps</span></dd></div>' +
    '<div><dt>応答</dt><dd id="mping">—<span>ms</span></dd></div>' +
    '<div><dt>ゆらぎ</dt><dd id="mjit">—<span>ms</span></dd></div>' +
    '</dl><p class="meter__wire" id="mwire"></p></div>' +
    '<div id="mdone" hidden><button type="button" class="btn" id="mnext">結果をもとに続ける</button></div>' +
    '</section>'
  );

  const $ = function (id) { return document.getElementById(id); };

  state.speed = await window.Measure.run({
    onStage: function (s) { $('mstage').textContent = s; },
    onProgress: function (p) { $('mbar').style.width = (p * 100).toFixed(1) + '%'; },
    onDown: function (v) { $('mdown').textContent = v.toFixed(1); },
    onUp: function (v) { $('mup').innerHTML = v.toFixed(1) + '<span>Mbps</span>'; },
    onPing: function (p, j) {
      $('mping').innerHTML = p.toFixed(0) + '<span>ms</span>';
      $('mjit').innerHTML = j.toFixed(1) + '<span>ms</span>';
    },
    onMeta: function (m) {
      const t = { fixed: '固定回線（自宅のWi-Fiなど）', mobile: '携帯回線', unknown: '判別できませんでした' }[m.connection];
      $('mwire').textContent = '接続元：' + (m.asOrg || '不明') + '　／　' + t;
    },
  });

  $('mdone').hidden = false;
  $('mnext').addEventListener('click', function () {
    if (typeof after === 'function') return after();
    state.idx++;
    render();
  });
}

/* ============================================================
   所見
   ============================================================ */

function finding() {
  const a = state.answers;
  const s = state.speed;
  const cat = category();
  const fresh = isNew();
  const place = a.place === 'house' ? '戸建て' : 'マンション・アパート';
  const setwari = a.carrier === 'other' ? '' : CARRIER_LABEL[a.carrier] + 'をお使いなので、セット割の対象になります。';
  const fig = s ? '実測は下り ' + s.down.toFixed(0) + 'Mbps、応答 ' + s.ping.toFixed(0) + 'ms でした。' : '';
  const mobile = s && s.meta && s.meta.connection === 'mobile';

  if (mobile) {
    return {
      tone: 'ok',
      verdict: '工事不要タイプが有力です',
      text: 'いまは携帯回線で接続されているため、この数値はご自宅のWi-Fiの実力ではありません。ただし ' +
        s.down.toFixed(0) + 'Mbps 出ているということは、この場所の電波が十分に強いということです。' +
        place + 'にお住まいなら、工事のいらないホームルーターで置き換えられる可能性が高いです。' + setwari,
    };
  }

  if (cat === 'router') {
    return {
      tone: 'warn',
      verdict: fresh ? 'ホームルーターが最適です' : 'ホームルーターの見直しが有効です',
      text: fig + '工事なしをご希望とのことなので、コンセントに挿すだけで使える据置型をご案内します。' +
        place + 'にお住まいであれば、お申し込みから最短で翌日に発送でき、届いたその日から使えます。' + setwari,
    };
  }

  if (a.focus === 'speed' && s && s.down >= 200 && s.ping <= 30) {
    return {
      tone: 'ok',
      verdict: '回線そのものは問題ありません',
      text: fig + '十分な数値が出ているので、体感が悪い原因は回線ではなく宅内のWi-Fi環境にある可能性が高いです。' +
        'ルーターの入れ替えで改善するケースがほとんどですが、あわせて料金の見直しもご提案できます。' + setwari,
    };
  }

  if (a.focus === 'speed') {
    return {
      tone: 'warn',
      verdict: '接続方式が古い可能性があります',
      text: fig + '速度が出ない場合、回線そのものよりIPv6（IPoE）という新しい接続方式が有効になっていないケースが多くあります。' +
        '古い方式のままだと、夜間など混み合う時間帯に大きく落ち込みます。' + place +
        'に対応した回線の中から、最新方式のものをご案内します。' + setwari,
    };
  }

  if (a.focus === 'renew') {
    return {
      tone: 'warn',
      verdict: '違約金は負担できます',
      text: '更新月を待つ必要はありません。他社の違約金や撤去費用は、乗り換え特典で補填できる場合がほとんどです。' +
        place + '向けのプランの中から、いまのご契約と比べて総額でいくら変わるかを試算してご案内します。' + setwari,
    };
  }

  return {
    tone: 'warn',
    verdict: fresh ? '光回線が本命です' : '乗り換えで下げられる余地があります',
    text: fig + place + 'にお住まいで' + (a.focus === 'price' ? '料金を重視される' : '特典を重視される') +
      'とのことなので、主要9回線の中から条件のよいものを比較してご案内します。' + setwari +
      '速度や品質を落とさずに、月額と初期費用の両方を見直せる可能性があります。',
  };
}

function offerHTML(o, noteOverride) {
  return '<div class="offer"><div class="offer__head">' + o.head + '</div>' +
    '<div class="offer__body"><p class="offer__label">' + o.label + '</p>' +
    '<p class="offer__price"><span class="offer__num">' + o.amount + '</span><span class="offer__yen">円</span></p>' +
    '<p class="offer__note">' + (noteOverride || o.note) + '</p>' +
    '<ul class="perks">' + o.perks.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
    '</div></div>';
}

/* ============================================================
   結果と特典
   ============================================================ */

function renderResult() {
  const f = finding();
  const o = OFFERS[offerKey()];
  const canMeasure = !state.speed;

  paint(
    '<section class="card">' +
    '<span class="verdict verdict--' + f.tone + '">' + f.verdict + '</span>' +
    '<p class="finding">' + f.text + '</p>' +
    offerHTML(o) +
    '<button type="button" class="btn" id="toform">この特典で無料見積もりを受け取る</button>' +
    (canMeasure ? '<button type="button" class="btn btn--sub" id="also">先に回線速度も測っておく</button>' : '') +
    '<ul class="assure">' +
    '<li>ご相談も見積もりも無料です。その場でご契約いただく必要はありません。</li>' +
    '<li>ご提供エリアと建物の設備状況を確認したうえで、正確な金額をお伝えします。</li>' +
    '<li>ご連絡は1回のみです。お断りいただいた後に、こちらから再度ご連絡することはありません。</li>' +
    '</ul>' +
    '<div class="faq">' +
    '<details><summary>いま使っている回線の違約金はどうなりますか？</summary>' +
    '<p>乗り換え特典で補填できる場合がほとんどです。上限や条件は事業者によって異なるため、ご契約内容を確認したうえで、負担が残らない組み合わせをご提案します。</p></details>' +
    '<details><summary>工事の立ち会いは必要ですか？</summary>' +
    '<p>光回線は原則として立ち会いが必要ですが、建物にすでに設備が入っている場合は不要なこともあります。ホームルーターであれば工事も立ち会いも一切不要です。</p></details>' +
    '<details><summary>すぐに契約しないといけませんか？</summary>' +
    '<p>いいえ。まずは金額を見ていただくためのご案内です。他社と比較していただいて構いません。</p></details>' +
    '</div>' +
    '<button type="button" class="q__back">← 回答をやり直す</button>' +
    '</section>'
  );

  document.getElementById('toform').addEventListener('click', renderForm);
  stage.querySelector('.q__back').addEventListener('click', function () { state.idx--; render(); });
  const also = document.getElementById('also');
  if (also) also.addEventListener('click', function () { runMeasure(renderResult); });
}

/* ============================================================
   フォーム（提案用のため送信・保存はしません）
   ============================================================ */

const TIMES = ['午前中', '12時〜15時', '15時〜18時', '18時以降'];

function renderForm() {
  const o = OFFERS[offerKey()];

  paint(
    '<section class="card">' +
    offerHTML(o, 'ご入力いただくと、適用できる正確な金額を無料で試算します') +
    '<label class="field"><span>お名前</span>' +
    '<input type="text" id="f-name" autocomplete="name" placeholder="鈴木 太郎"></label>' +
    '<label class="field"><span>電話番号</span>' +
    '<input type="tel" id="f-tel" autocomplete="tel" inputmode="tel" placeholder="09012345678"></label>' +
    '<label class="field"><span>メールアドレス（任意）</span>' +
    '<input type="email" id="f-mail" autocomplete="email" inputmode="email" placeholder="taro@example.com"></label>' +
    '<div class="field"><span>ご都合のよい時間帯（任意）</span><div class="times">' +
    TIMES.map(function (t) {
      return '<button type="button" data-t="' + t + '"' + (state.time === t ? ' class="is-on"' : '') + '>' + t + '</button>';
    }).join('') +
    '</div></div>' +
    '<button type="button" class="btn" id="send">無料で試算を受け取る</button>' +
    '<p class="err" id="err" hidden></p>' +
    '<p class="closing">入力は30秒。しつこい勧誘は一切ありません。</p>' +
    '<p class="consent">ご入力いただいた内容は、ご案内の目的でのみ使用します。ご希望があればいつでも削除できます。</p>' +
    '<button type="button" class="q__back">← 結果に戻る</button>' +
    '</section>'
  );

  stage.querySelectorAll('.times button').forEach(function (b) {
    b.addEventListener('click', function () {
      stage.querySelectorAll('.times button').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      state.time = b.dataset.t;
    });
  });

  stage.querySelector('.q__back').addEventListener('click', renderResult);

  document.getElementById('send').addEventListener('click', function () {
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

    console.log('LEAD (送信なし)', {
      name: name, tel: tel, mail: mail, time: state.time,
      answers: state.answers, offer: offerKey(), speed: state.speed,
    });

    paint(
      '<section class="card"><div class="thanks">' +
      '<div class="thanks__mark"></div>' +
      '<h2 class="thanks__title">受け付けました</h2>' +
      '<p class="thanks__body">担当者より、ご希望の時間帯にご連絡します。<br>' +
      '特典の適用可否とあわせて、正確な金額をお伝えします。</p>' +
      '</div></section>'
    );
  });
}

/* ── 起動 ── */
render();
