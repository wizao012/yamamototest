# 通信速度検査票 — テスト用LP

回線速度を実測し、4つの質問と合わせて提案候補を出し、リードを取るLPの試作。
Cloudflare Workers 1つで、静的LPと計測APIの両方を配信します。

```
wrangler.jsonc      Worker の設定
worker/index.ts     計測API・接続元判定・リード受付
public/index.html   LP本体
public/style.css    スタイル
public/app.js       計測エンジン・診断・提案ロジック
schema.sql          D1 を使う場合のテーブル定義（任意）
```

---

## A. 手元で動かす

Node.js 20 以上が必要です。

```bash
npm install
npx wrangler login      # ブラウザが開くので Cloudflare にログイン
npm run dev             # http://localhost:8787 が開きます
```

> ローカルでは自分のPCの中で通信が完結するため、速度が数千Mbpsなど非現実的な値になります。
> 数値の確認は必ずデプロイ後に行ってください。UIと導線の確認はローカルで十分です。

## B. とりあえず公開する（CLI・所要3分）

```bash
npm run deploy
```

`https://kaisen-check.<あなたのサブドメイン>.workers.dev` が払い出されます。
初回のみサブドメイン名を聞かれるので、任意の文字列を入力してください。

## C. GitHub と紐付けて自動デプロイ（本命）

できます。**Workers Builds** という Cloudflare 純正のCI/CDです。
<cite index="52-1">GitHub / GitLab のリポジトリを Worker に接続すると、push するたびに自動でビルド・デプロイされます。ビルド状況はプルリクエストのコメントやチェックとして Git 側にも表示されます。</cite>

### 手順

1. このフォルダを GitHub にプッシュする

   ```bash
   git init
   git add .
   git commit -m "初期コミット"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

2. Cloudflare ダッシュボードで **Workers & Pages** を開く

3. 先に `npm run deploy` を一度実行して Worker を作っておく
   （Workers Builds は既存の Worker に対して接続する形なので、先に箱を作ります）

4. 作成された Worker を選び、**Settings → Builds → Git Repository → Manage** へ進む

5. GitHub の認証を求められるので許可する
   <cite index="52-1">初回は GitHub / GitLab へのインストールを促されるので、案内に従って認証してください。</cite>
   このとき **Only select repositories** を選び、このリポジトリだけに絞るのを推奨します

6. 対象リポジトリと本番ブランチ（`main`）を選択

7. ビルド設定を入力

   | 項目 | 値 |
   |---|---|
   | Build command | （空欄でOK。ビルド工程がないため） |
   | Deploy command | `npx wrangler deploy` |

これで完了です。以降 `git push` するだけで本番に反映されます。
`main` 以外のブランチに push すると、そのブランチ用のプレビューURLが自動生成され、
プルリクエストにコメントとして貼られます。本番を壊さず試せます。

> ダッシュボードUIからのみ設定可能で、APIでの自動化は現時点では未対応です。
> 一度設定すれば以後触らないので、実用上の問題はありません。

## D. リードを D1 に保存する（任意）

初期状態ではリードは Workers のログに出力されるだけです。
`npx wrangler tail` で流れてくるので、テスト段階はこれで足ります。

保存したくなったら:

```bash
npx wrangler d1 create kaisen-leads
# 出力された database_id を wrangler.jsonc に貼り、d1_databases のコメントを外す
npx wrangler d1 execute kaisen-leads --remote --file=./schema.sql
npm run deploy
```

`worker/index.ts` 側は `env.DB` があれば自動で INSERT するようになっているので、
コードの変更は不要です。

---

## 差し替えるところ

| 場所 | 内容 |
|---|---|
| `public/app.js` の `HIKARI` / `HOMEROUTER` | 商材名。御社の取扱商品に置き換えてください |
| `public/app.js` の `diagnose()` | 提案ロジック本体。判定の閾値と文面はここ |
| `worker/index.ts` の `FIXED_HINTS` / `MOBILE_HINTS` | 固定 / 携帯の判定キーワード |
| `wrangler.jsonc` の `name` | Worker名。そのままURLになります |

### 接続元判定について

`request.cf.asOrganization`（接続元のプロバイダ名）で固定回線か携帯回線かを推定しています。
キーワードマッチなので完璧ではありません。

公開後1〜2週間ほど `npx wrangler tail` でログを眺め、
`unknown` になっている `as_org` の値を拾って `FIXED_HINTS` / `MOBILE_HINTS` に足していくと精度が上がります。
最初から当てにいかず、実データで育てる前提で運用してください。

### 計測パラメータ

`public/app.js` 冒頭の `CFG` で調整します。
数値がばらつく場合は `DOWN_MS` を伸ばすか `DOWN_STREAMS` を増やしてください。
逆に無料枠の消費を抑えたい場合は `DOWN_CHUNK` を小さくします。

---

## 公開前に必ず確認すること

これはあくまで動作検証用の試作です。実際に広告を回す前に、

- 計測値の表現（「遅い」と断定していないか）
- 商材の速度・料金表示の根拠
- 個人情報の取得目的の明示と、回線事業者への提供に関する同意文言

について、法務確認を通してください。フッターに仮の注記を入れてありますが、
そのまま本番に出せる文面ではありません。
