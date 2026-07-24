/**
 * 回線速度チェック + 診断LP の Worker
 *
 *  GET  /api/meta        接続元情報（ASN / 回線種別の推定）
 *  GET  /api/down?bytes= 下り計測用のランダムデータ
 *  POST /api/up          上り計測用（受け取って破棄）
 *  POST /api/lead        リード受付
 *  それ以外              public/ の静的ファイル
 */

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
}

// 64KB の乱数ブロック。
// Workers はグローバルスコープでの乱数生成を禁じているため、ここでは変数を用意するだけにして
// 最初のリクエストが来たときに一度だけ生成する。以後は同じものを使い回すので、
// リクエストごとに乱数を作り直す無駄は発生しない。
let CHUNK: Uint8Array | null = null;

function chunk(): Uint8Array {
  if (!CHUNK) CHUNK = crypto.getRandomValues(new Uint8Array(65536));
  return CHUNK;
}

const MAX_DOWN_BYTES = 100 * 1024 * 1024; // 濫用対策の上限
const DEFAULT_DOWN_BYTES = 25 * 1024 * 1024;

const noStore = {
  "cache-control": "no-store, no-transform",
  "access-control-allow-origin": "*",
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...noStore,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (path === "/api/meta") return handleMeta(req);
    if (path === "/api/down") return handleDown(url);
    if (path === "/api/up" && req.method === "POST") return handleUp(req);
    if (path === "/api/lead" && req.method === "POST") return handleLead(req, env, ctx);

    return env.ASSETS.fetch(req);
  },
};

/* ------------------------------------------------------------------ */
/* 接続元の判定                                                        */
/* ------------------------------------------------------------------ */

/**
 * asOrganization（AS の組織名）のキーワードで固定 / モバイルを推定する。
 *
 * ASN 番号の直書きより組織名マッチの方が壊れにくいが、どちらにせよ完璧ではない。
 * 公開後1〜2週間 /api/lead に asn と asOrg を貯めて、実データを見ながら
 * このリストを育てるのが正しい運用。
 */
const MOBILE_HINTS = [
  "docomo",
  "mobile",
  "rakuten mobile",
  "uq ",
  "wireless",
  "cellular",
  "lte",
];

const FIXED_HINTS = [
  "ntt communications",
  "ocn",
  "so-net",
  "sony network",
  "biglobe",
  "nifty",
  "asahi net",
  "jcom",
  "j:com",
  "k-opticom",
  "optage",
  "arteria",
  "usen",
  "tokai",
  "chubu telecommunications",
  "ctc",
  "nuro",
  "internet initiative", // IIJ
];

function classifyConnection(asOrg: string): "fixed" | "mobile" | "unknown" {
  const s = (asOrg || "").toLowerCase();
  if (!s) return "unknown";
  // 固定のヒントを先に見る（"NTT DOCOMO" と "NTT Communications" の取り違えを防ぐ）
  if (FIXED_HINTS.some((k) => s.includes(k))) return "fixed";
  if (MOBILE_HINTS.some((k) => s.includes(k))) return "mobile";
  return "unknown";
}

function handleMeta(req: Request): Response {
  const cf = (req as any).cf ?? {};
  const asOrg: string = cf.asOrganization ?? "";

  return Response.json(
    {
      asn: cf.asn ?? null,
      asOrg,
      connection: classifyConnection(asOrg),
      colo: cf.colo ?? null,
      country: cf.country ?? null,
      region: cf.region ?? null,
      city: cf.city ?? null,
      httpProtocol: cf.httpProtocol ?? null,
      serverTime: Date.now(),
    },
    { headers: noStore }
  );
}

/* ------------------------------------------------------------------ */
/* 下り計測                                                            */
/* ------------------------------------------------------------------ */

function handleDown(url: URL): Response {
  const requested = Number(url.searchParams.get("bytes"));
  const total =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_DOWN_BYTES)
      : DEFAULT_DOWN_BYTES;

  const buf = chunk();
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const n = Math.min(buf.length, total - sent);
      controller.enqueue(n === buf.length ? buf : buf.subarray(0, n));
      sent += n;
    },
  });

  return new Response(stream, {
    headers: {
      ...noStore,
      // 圧縮されると転送量と実サイズがズレて計測値が壊れるので octet-stream 固定
      "content-type": "application/octet-stream",
    },
  });
}

/* ------------------------------------------------------------------ */
/* 上り計測                                                            */
/* ------------------------------------------------------------------ */

async function handleUp(req: Request): Promise<Response> {
  // 受け取って捨てるだけ。読み切らないと計測が途中で終わる
  if (req.body) {
    await req.body.pipeTo(
      new WritableStream({
        write() {
          /* discard */
        },
      })
    );
  }
  return new Response("ok", { headers: noStore });
}

/* ------------------------------------------------------------------ */
/* リード受付                                                          */
/* ------------------------------------------------------------------ */

async function handleLead(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: noStore });
  }

  const cf = (req as any).cf ?? {};
  const record = {
    created_at: new Date().toISOString(),
    name: String(body.name ?? "").slice(0, 100),
    contact: String(body.contact ?? "").slice(0, 200),
    answers: JSON.stringify(body.answers ?? {}),
    result: JSON.stringify(body.result ?? {}),
    asn: cf.asn ?? null,
    as_org: cf.asOrganization ?? null,
    connection: classifyConnection(cf.asOrganization ?? ""),
    colo: cf.colo ?? null,
  };

  // テスト段階は Workers のログに出すだけ。
  // 本番化するときは wrangler.jsonc の d1_databases を有効にして下の INSERT を使う。
  console.log("LEAD", JSON.stringify(record));

  if (env.DB) {
    ctx.waitUntil(
      env.DB.prepare(
        `INSERT INTO leads
           (created_at, name, contact, answers, result, asn, as_org, connection, colo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          record.created_at,
          record.name,
          record.contact,
          record.answers,
          record.result,
          record.asn,
          record.as_org,
          record.connection,
          record.colo
        )
        .run()
        .catch((e) => console.error("D1 insert failed", e))
    );
  }

  return Response.json({ ok: true }, { headers: noStore });
}
