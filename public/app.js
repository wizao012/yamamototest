/* ============================================================
   ネット乗り換えの窓口 — 診断LP
   ============================================================ */

const stage = document.getElementById('stage');
const state = { answers: {}, speed: null, idx: 0 };

/* ── 取扱商材（御社のラインナップに差し替えてください）── */
const HIKARI = {
  docomo: 'ドコモ光',
  au: 'auひかり',
  sb: 'SoftBank 光',
  rakuten: '楽天ひかり',
  other: 'NURO 光',
};
const ROUTER = {
  docomo: 'home 5G',
  au: 'au ホームルーター 5G',
  sb: 'SoftBank Air',
  rakuten: 'Rakuten Turbo',
  other: 'SoftBank Air',
};
const CARRIER_LABEL = {
  docomo: 'ドコモ', au: 'au・UQ', sb: 'ソフトバンク・ワイモバイル',
  rakuten: '楽天モバイル', other: 'ご利用のスマホ',
};

/* ============================================================
   質問の定義
   ============================================================ */

const Q = {
  have: {
    title: '自宅にインターネット回線はありますか？',
    hint: 'スマホのギガだけで生活している方は「いいえ」を選んでください',
    opts: [['yes', 'はい、使っている'], ['no', 'いいえ／スマホのギガだけ']],
  },

  /* ── Aルート ── */
  a_current: {
    title: 'いま何をお使いですか？',
    opts: [
      ['hikari', '光回線'],
      ['router', 'ホームルーター（置くだけ）'],
      ['pocket', 'ポケットWiFi・モバイルルーター'],
      ['catv', 'ケーブルテレビ'],
      ['unknown', 'わからない'],
    ],
  },
  a_pain: {
    title: 'いちばんの不満はどれですか？',
    opts: [
      ['price', '料金が高い'],
      ['speed', '速度が遅い・途切れる'],
      ['support', 'サポートがつながらない'],
      ['renew', '不満はないが乗り換えを検討中'],
    ],
  },

  /* ── Bルート ── */
  b_status: {
    title: 'いまの状況に近いのはどれですか？',
    opts: [
      ['enough', 'スマホのギガで足りている'],
      ['short', 'ギガが足りず困っている'],
      ['moving', '引っ越し予定・引っ越したばかり'],
      ['grow', '在宅勤務や家族の利用が増える'],
    ],
  },
  b_priority: {
    title: '自宅に回線を置くなら、何を重視しますか？',
    opts: [
      ['cheap', 'とにかく安く'],
      ['nowork', '工事なしですぐ使いたい'],
      ['fast', '速度と安定性'],
      ['undecided', 'まだ決めていない'],
    ],
  },

  /* ── 共通 ── */
  work: {
    title: '開通工事はできますか？',
    hint: '光回線は原則として工事が必要です',
    opts: [
      ['ok', 'できる'],
      ['avoid', 'できれば避けたい'],
      ['ng', '工事なしがいい'],
    ],
  },
  home: {
    title: 'お住まいはどちらですか？',
    opts: [['house', '戸建て'], ['apart', 'マンション・アパート']],
  },
  carrier: {
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

/* 回答内容から、たどるべき質問の並びを組み立てる */
function sequence() {
  const a = state.answers;
  const s = ['have'];
  if (a.have === 'yes') {
    s.push('a_current', 'a_pain');
    if (a.a_pain === 'speed') s.push('__speed');
  } else if (a.have === 'no') {
    s.push('b_status', 'b_priority');
  } else {
    return s;
  }
  s.push('work', 'home', 'carrier');
  return s;
}

const countQuestions = (seq) => seq.filter((k) => k !== '__speed').length;

/* ============================================================
   画面の描画
   ============================================================ */

function paint(html) {
  stage.innerHTML = html;
  const card = stage.querySelector('.card');
  if (card) card.classList.add('card--enter');
}

function progressHTML() {
  const seq = sequence();
  const total = countQuestions(seq);
  const done = countQuestions(seq.slice(0, state.idx));
  const left = Math.max(total - done, 0);
  return `
    <div class="prog">
      <div class="prog__track"><div class="prog__fill" style="width:${(done / total) * 100}%"></div></div>
      <div class="prog__meta">
        <span>質問 <b>${Math.min(done + 1, total)}</b> / ${total}</span>
        <span>${left <= 1 ? 'あと少しです' : `残り ${left} 問`}</span>
      </div>
    </div>`;
}

function render() {
  const seq = sequence();
  if (state.idx >= seq.length) return renderResult();

  const key = seq[state.idx];
  if (key === '__speed') return renderSpeedOffer();

  const q = Q[key];
  paint(`
    <section class="card">
      ${progressHTML()}
      <h2 class="q__title">${q.title}</h2>
      ${q.hint ? `<p class="q__hint">${q.hint}</p>` : '<div style="height:12px"></div>'}
      <div class="choices">
        ${q.opts.map(([v, t]) => `
          <button type="button" class="choice${state.answers[key] === v ? ' is-on' : ''}" data-v="${v}">
            <span class="choice__tick"></span><span>${t}</span>
          </button>`).join('')}
      </div>
      ${state.idx > 0 ? '<button type="button" class="q__back">← ひとつ戻る</button>' : ''}
    </section>`);

  stage.querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => {
      stage.querySelectorAll('.choice').forEach((o) => o.classList.remove('is-on'));
      b.classList.add('is-on');
      state.answers[key] = b.dataset.v;
      setTimeout(() => { state.idx++; render(); }, 220);
    });
  });

  const back = stage.querySelector('.q__back');
  if (back) back.addEventListener('click', () => { state.idx--; render(); });
}

/* ============================================================
   速度計測
   ============================================================ */

function renderSpeedOffer() {
  paint(`
    <section class="card">
      ${progressHTML()}
      <h2 class="q__title">実際の速度を測ってみませんか？</h2>
      <p class="q__hint">
        「遅い」の原因が回線側にあるのか、宅内のWi-Fi側にあるのかで、
        ご案内する内容が変わります。約15秒で終わります。
      </p>
      <button type="button" class="btn" id="go">速度を測ってみる</button>
      <button type="button" class="btn btn--sub" id="skip">測らずに次へ進む</button>
      <button type="button" class="q__back">← ひとつ戻る</button>
    </section>`);

  stage.querySelector('#go').addEventListener('click', runMeasure);
  stage.querySelector('#skip').addEventListener('click', () => { state.idx++; render(); });
  stage.querySelector('.q__back').addEventListener('click', () => { state.idx--; render(); });
}

function meterHTML() {
  return `
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
        <button type="button" class="btn" id="mnext">結果をもとに診断を続ける</button>
      </div>
    </section>`;
}

async function runMeasure(after) {
  paint(meterHTML());
  const $ = (id) => document.getElementById(id);

  const res = await window.Measure.run({
    onStage: (s) => ($('mstage').textContent = s),
    onProgress: (p) => ($('mbar').style.width = (p * 100).toFixed(1) + '%'),
    onDown: (v) => ($('mdown').textContent = v.toFixed(1)),
    onUp: (v) => ($('mup').innerHTML = v.toFixed(1) + '<span>Mbps</span>'),
    onPing: (p, j) => {
      $('mping').innerHTML = p.toFixed(0) + '<span>ms</span>';
      $('mjit').innerHTML = j.toFixed(1) + '<span>ms</span>';
    },
    onMeta: (m) => {
      const label = { fixed: '固定回線（自宅のWi-Fiなど）', mobile: '携帯回線', unknown: '判別できませんでした' }[m.connection];
      $('mwire').textContent = `接続元：${m.asOrg || '不明'}　／　${label}`;
    },
  });

  state.speed = res;
  $('mdone').hidden = false;
  $('mnext').addEventListener('click', () => {
    if (typeof after === 'function') return after();
    state.idx++;
    render();
  });
}

/* ============================================================
   診断ロジック
   ============================================================ */

function diagnose() {
  const a = state.answers;
  const s = state.speed;
  const carrier = a.carrier || 'other';
  const hikari = HIKARI[carrier];
  const router = ROUTER[carrier];
  const setwari = carrier === 'other'
    ? ''
    : `${CARRIER_LABEL[carrier]}とのセット割の対象です。`;
  const place = a.home === 'house' ? '戸建て' : 'マンション・アパート';

  const measured = !!s;
  const down = s ? s.down : 0;
  const mobile = s && s.meta && s.meta.connection === 'mobile';
  const slow = measured && down < 80;
  const laggy = measured && (s.ping > 50 || s.jitter > 20);

  const R = (name, why, top) => ({ name, why, top: !!top });

  /* ── Bルート ── */
  if (a.have === 'no') {
    if (a.b_status === 'enough') {
      return {
        tone: 'ok',
        verdict: 'いまは乗り換え不要です',
        finding:
          'スマホのギガで足りているとのことなので、いま無理に自宅回線を契約する必要はありません。' +
          '固定回線が必要になるのは、動画を長時間見る、在宅勤務が増える、家族の台数が増えるといったタイミングです。' +
          'その時が来たら、あらためてご相談ください。',
        recos: [
          R('いまは契約しないという選択', '毎月の固定費が増えないことが、いちばんのメリットです。必要になってからで間に合います。'),
          R('スマホの料金プランの見直し', 'ギガが余っているなら、プランを下げるだけで月額を減らせる場合があります。', true),
        ],
        cta: '資料だけ受け取る',
        soft: true,
      };
    }

    const nowork = a.work === 'ng' || a.b_priority === 'nowork';
    if (nowork) {
      return {
        tone: 'warn',
        verdict: '工事不要タイプがおすすめです',
        finding:
          `工事なしをご希望とのことなので、コンセントに挿すだけで使える据置型が最有力です。` +
          `${place}にお住まいで、申し込みから最短で数日、届いたその日から使えます。`,
        recos: [
          R(router, `工事も立ち会いも不要です。${setwari}`, true),
          R('モバイルルーターとの併用', '外出先でも使いたい場合は、持ち運べるタイプを組み合わせる方法もあります。'),
        ],
        cta: '無料で見積もりを受け取る',
      };
    }

    return {
      tone: 'warn',
      verdict: '光回線が本命です',
      finding:
        `工事が可能で、${a.b_priority === 'fast' ? '速度と安定性を重視される' : 'これから環境を整えられる'}とのことなので、` +
        `${place}向けの光回線をおすすめします。` +
        (a.b_status === 'moving' ? '引っ越しのタイミングは工事枠が取りやすく、キャンペーンも重なりやすい時期です。' : ''),
      recos: [
        R(hikari, `速度・安定性ともに据置型を上回ります。${setwari}`, true),
        R(router, '工事の日程がすぐ取れない場合の、つなぎとしても使えます。'),
      ],
      cta: '無料で見積もりを受け取る',
    };
  }

  /* ── Aルート ── */

  // 光をお使いで、速度に不満
  if (a.a_current === 'hikari' && a.a_pain === 'speed') {
    if (measured && !mobile && !slow && !laggy) {
      return {
        tone: 'ok',
        verdict: '回線そのものは問題ありません',
        finding:
          `実測で下り ${down.toFixed(0)}Mbps、応答 ${s.ping.toFixed(0)}ms が出ています。` +
          '光回線としては十分な数値なので、体感が悪い原因は回線ではなく、宅内のWi-Fi環境にある可能性が高いです。' +
          'ルーターの世代が古い、設置場所が悪い、といったケースがほとんどです。',
        recos: [
          R('Wi-Fiルーターの見直し', '回線が速くてもルーターが古いと頭打ちになります。費用も期間も最小で済む改善策です。', true),
          R(`${hikari}へのプラン見直し`, `速度は保ったまま月額を下げられる場合があります。${setwari}`),
        ],
        cta: '無料で相談してみる',
      };
    }
    return {
      tone: 'warn',
      verdict: '接続方式が古い可能性があります',
      finding:
        (measured ? `実測で下り ${down.toFixed(0)}Mbps、応答 ${s.ping.toFixed(0)}ms でした。` : '') +
        '光回線をお使いで速度に不満がある場合、回線そのものより、IPv6（IPoE）という新しい接続方式が有効になっていないケースが多くあります。' +
        '古い方式のままだと、夜間など混み合う時間帯に大きく落ち込みます。',
      recos: [
        R(`${hikari}（IPv6対応プラン）`, `接続方式を切り替えるだけで改善する例が多く、事業者変更なら工事不要で済むこともあります。${setwari}`, true),
        R('IPv6対応ルーターへの交換', 'すでにIPv6対応のご契約なら、ルーター側が原因です。まずここを確認します。'),
      ],
      cta: '無料で診断してもらう',
    };
  }

  // 光をお使いで、料金に不満
  if (a.a_current === 'hikari' && a.a_pain === 'price') {
    return {
      tone: 'warn',
      verdict: 'セット割が使えていない可能性',
      finding:
        `お使いのスマホは${CARRIER_LABEL[carrier]}とのことですが、光回線が別の事業者のままだと、` +
        'スマホ側の割引が適用されていない場合があります。速度も品質も落とさずに月額だけ下げられる余地があります。',
      recos: [
        R(hikari, `${setwari || '事業者をまとめることで、窓口も請求も一本化できます。'}品質は現状と同等以上です。`, true),
        R('乗り換え時の還元を活用', '事業者変更のタイミングでキャッシュバックが受けられる場合があります。'),
      ],
      cta: '無料で料金を試算してもらう',
    };
  }

  // 光をお使いで、サポート不満 / 更新月狙い
  if (a.a_current === 'hikari') {
    return {
      tone: 'warn',
      verdict: '乗り換えを検討する価値があります',
      finding:
        a.a_pain === 'support'
          ? 'サポートの品質は事業者によって大きく差が出る部分です。回線の品質を落とさずに、窓口だけ変えることができます。'
          : '更新月やキャンペーン時期に合わせた乗り換えは、還元がもっとも大きくなるタイミングです。いまのご契約内容を確認したうえで、最適な時期をご案内します。',
      recos: [
        R(hikari, `${setwari}窓口が一本化され、問い合わせ先に迷わなくなります。`, true),
        R('現在のご契約の確認', '違約金や工事費の残債がある場合、負担してもらえる乗り換え先もあります。'),
      ],
      cta: '無料で相談してみる',
    };
  }

  // ホームルーター / ポケットWiFi / ケーブルテレビ / 不明
  const typeName = {
    router: 'ホームルーター', pocket: 'ポケットWiFi', catv: 'ケーブルテレビ', unknown: '現在の回線',
  }[a.a_current] || '現在の回線';

  if (a.work === 'ng') {
    return {
      tone: 'warn',
      verdict: '工事なしのまま改善できます',
      finding:
        `${typeName}をお使いで、工事は避けたいとのことですね。光回線は候補から外し、` +
        `工事のいらない範囲で改善する方法をご案内します。` +
        (measured ? `実測は下り ${down.toFixed(0)}Mbps でした。` : ''),
      recos: [
        R(router, `5G対応の最新モデルです。${setwari}コンセントに挿すだけで使えます。`, true),
        R('Wi-Fi中継機の追加', '回線を変えずに、電波の届きにくい部屋を改善する方法です。費用は最小で済みます。'),
      ],
      cta: '無料で見積もりを受け取る',
    };
  }

  return {
    tone: 'warn',
    verdict: '光回線への切り替えが有効です',
    finding:
      `${typeName}から光回線に変えると、速度・安定性・同時接続の余裕がいずれも改善します。` +
      (a.a_current === 'catv'
        ? 'ケーブルテレビはアップロードが細い構造のため、オンライン会議や動画投稿では特に差が出ます。'
        : '') +
      (a.a_pain === 'price' ? '月額も、セット割の適用で下がる場合があります。' : '') +
      (measured ? `実測は下り ${down.toFixed(0)}Mbps でした。` : ''),
    recos: [
      R(hikari, `${place}向けのプランがあります。${setwari}`, true),
      R(router, '工事の日程が取りにくい場合の次善策です。開通までのつなぎにもなります。'),
    ],
    cta: '無料で見積もりを受け取る',
  };
}

/* ============================================================
   結果とフォーム
   ============================================================ */

function renderResult() {
  const d = diagnose();
  const canMeasure = !state.speed;

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
      <button type="button" class="btn" id="toform">${d.cta}</button>
      ${canMeasure ? '<button type="button" class="btn btn--sub" id="alsomeasure">ついでに回線速度も測ってみる</button>' : ''}
      <button type="button" class="q__back">← 回答をやり直す</button>
    </section>`);

  document.getElementById('toform').addEventListener('click', () => renderForm(d));
  stage.querySelector('.q__back').addEventListener('click', () => { state.idx--; render(); });

  const also = document.getElementById('alsomeasure');
  if (also) also.addEventListener('click', () => runMeasure(renderResult));
}

function renderForm(d) {
  paint(`
    <section class="card">
      <h2 class="form__head">${d.soft ? '将来のために、資料をお送りします' : '具体的な料金と手順を、無料でお送りします'}</h2>
      <p class="form__lead">
        ${d.soft
          ? 'いま契約する必要はありません。必要になったときのために、比較資料だけお渡しします。'
          : 'ご回答内容をもとに、月額がいくら変わるか、工事の要否と期間まで含めて担当者がまとめてご連絡します。'}
      </p>
      <label class="field"><span>お名前</span>
        <input type="text" id="f-name" autocomplete="name" placeholder="鈴木 太郎"></label>
      <label class="field"><span>電話番号</span>
        <input type="tel" id="f-tel" autocomplete="tel" inputmode="tel" placeholder="09012345678"></label>
      <label class="field"><span>メールアドレス</span>
        <input type="email" id="f-mail" autocomplete="email" inputmode="email" placeholder="taro@example.com"></label>
      <button type="button" class="btn" id="send">${d.soft ? '資料を受け取る' : '無料で受け取る'}</button>
      <p class="err" id="err" hidden></p>
      <p class="consent">
        ご入力いただいた内容は、ご案内の目的でのみ使用します。
        ご希望があればいつでも削除できます。
      </p>
      <button type="button" class="q__back">← 結果に戻る</button>
    </section>`);

  stage.querySelector('.q__back').addEventListener('click', renderResult);

  document.getElementById('send').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    const tel = document.getElementById('f-tel').value.trim();
    const mail = document.getElementById('f-mail').value.trim();
    const err = document.getElementById('err');

    if (!name) return fail(err, 'お名前を入力してください。', 'f-name');
    if (!tel && !mail) return fail(err, '電話番号かメールアドレスのどちらかを入力してください。', 'f-tel');

    // 提案用の試作のため、送信も保存も行いません
    console.log('LEAD (送信なし)', { name, tel, mail, answers: state.answers, speed: state.speed });
    renderThanks();
  });
}

function fail(el, msg, focusId) {
  el.textContent = msg;
  el.hidden = false;
  document.getElementById(focusId).focus();
}

function renderThanks() {
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
}

/* ── 起動 ── */
render();
