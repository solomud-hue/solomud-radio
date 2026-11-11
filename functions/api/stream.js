const RADIO_BROWSER_HOSTS = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];

const CUSTOM_STREAMS = {
  "e45b77ad-3e75-4b16-bdb4-75cd6aa5baff": [
    "https://radio3.dixi.md/listen/hit_fm_2000s_hits/hitfm2000hit128.aac"
  ],
  "solomud-dfm-moscow": [
    "https://dfm.hostingradio.ru/dfm96.aacp"
  ],
  "solomud-pioner-fm": [
    "https://ppr.status-media.ru/ppr128.mp3",
    "https://listen9.myradio24.com/pionerfm_256"
  ]
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFILL_SECONDS = 5;
const PREFILL_MAX_WAIT_MS = 7000;
const PREFILL_MAX_BYTES = 320 * 1024;

function corsHeaders(headers = new Headers()) {
  const out = new Headers(headers);
  out.set("Access-Control-Allow-Origin", "*");
  out.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  out.set("Access-Control-Allow-Headers", "Range, Icy-MetaData");
  out.set("Access-Control-Expose-Headers", "Content-Type, Content-Range, Accept-Ranges, icy-name, icy-url, icy-br, icy-metaint, icy-genre, icy-pub, icy-description, X-Solomud-Buffered-Bytes");
  out.set("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
  out.set("Vary", "Origin");
  return out;
}

function validHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && value.length <= 2048;
  } catch {
    return false;
  }
}

function originOf(value) {
  try { return new URL(value).origin; } catch { return ""; }
}

async function radioBrowserStation(stationId) {
  for (const host of RADIO_BROWSER_HOSTS) {
    try {
      const response = await fetch(
        host + "/json/stations/byuuid/" + encodeURIComponent(stationId),
        {
          headers: { Accept: "application/json", "User-Agent": "SolomudRadio/1.0" },
          cf: { cacheTtl: 300, cacheEverything: true },
          signal: AbortSignal.timeout(5000)
        }
      );
      if (!response.ok) continue;
      const rows = await response.json();
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch {}
  }
  return null;
}

async function approvedSource(stationId, source) {
  const custom = CUSTOM_STREAMS[stationId];
  if (custom) return custom.includes(source) ? source : null;
  if (!UUID_RE.test(stationId)) return null;

  const station = await radioBrowserStation(stationId);
  if (!station) return null;
  const allowedOrigins = [station.url_resolved, station.url]
    .filter(value => typeof value === "string" && validHttpsUrl(value))
    .map(originOf)
    .filter(Boolean);
  return allowedOrigins.includes(originOf(source)) ? source : null;
}

function timedRead(promise, timeoutMs) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve({ value }); },
      error => { clearTimeout(timer); resolve({ error }); }
    );
  });
}

function guessedContentType(source, received) {
  if (received && received !== "application/octet-stream") return received;
  const path = new URL(source).pathname.toLowerCase();
  if (/\.aacp?$/.test(path)) return "audio/aac";
  if (/\.mp3$/.test(path)) return "audio/mpeg";
  if (/\.ogg$/.test(path)) return "audio/ogg";
  if (/\.opus$/.test(path)) return "audio/ogg; codecs=opus";
  return received || "application/octet-stream";
}

export async function onRequest({ request }) {
  const requestUrl = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" })) });
  }

  const stationId = requestUrl.searchParams.get("station") || "";
  const source = requestUrl.searchParams.get("source") || "";
  const bitrate = Math.min(512, Math.max(32, Number.parseInt(requestUrl.searchParams.get("bitrate") || "128", 10) || 128));
  if (!stationId || !source || !validHttpsUrl(source)) {
    return new Response("Invalid stream request", { status: 400, headers: corsHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" })) });
  }

  const approved = await approvedSource(stationId, source);
  if (!approved) {
    return new Response("Unverified station stream", { status: 403, headers: corsHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" })) });
  }

  const controller = new AbortController();
  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  headers.set("Accept", "*/*");
  headers.set("Icy-MetaData", "1");

  let upstream;
  try {
    upstream = await fetch(approved, { headers, redirect: "follow", signal: controller.signal });
  } catch {
    return new Response("Upstream stream unavailable", { status: 502, headers: corsHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" })) });
  }

  const responseHeaders = new Headers();
  const allowedHeaders = [
    "content-type", "content-range", "accept-ranges", "icy-name", "icy-url",
    "icy-br", "icy-metaint", "icy-genre", "icy-pub", "icy-description"
  ];
  for (const name of allowedHeaders) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("Content-Type", guessedContentType(approved, responseHeaders.get("Content-Type")));
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  const responseCorsHeaders = corsHeaders(responseHeaders);

  if (request.method === "HEAD" || !upstream.body || !upstream.ok) {
    controller.abort();
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseCorsHeaders
    });
  }

  const reader = upstream.body.getReader();
  const actualBitrate = Number.parseInt(upstream.headers.get("icy-br") || "", 10) || bitrate;
  const targetBytes = Math.min(
    PREFILL_MAX_BYTES,
    Math.max(16 * 1024, Math.ceil(actualBitrate * 1000 / 8 * PREFILL_SECONDS))
  );
  const deadline = Date.now() + PREFILL_MAX_WAIT_MS;
  const initialChunks = [];
  let initialBytes = 0;
  let streamEnded = false;
  let pendingRead = reader.read();

  while (initialBytes < targetBytes && !streamEnded) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const result = await timedRead(pendingRead, remaining);
    if (result.timedOut) break;
    if (result.error) {
      controller.abort();
      return new Response("Upstream stream interrupted", { status: 502, headers: responseCorsHeaders });
    }
    const next = result.value;
    if (next.done) {
      streamEnded = true;
      break;
    }
    initialChunks.push(next.value);
    initialBytes += next.value.byteLength;
    pendingRead = reader.read();
  }

  responseCorsHeaders.set("X-Solomud-Buffered-Bytes", String(initialBytes));
  const body = new ReadableStream({
    start(streamController) {
      for (const chunk of initialChunks) streamController.enqueue(chunk);
      if (streamEnded) {
        streamController.close();
        return;
      }
      (async () => {
        try {
          let next = await pendingRead;
          while (!next.done) {
            streamController.enqueue(next.value);
            next = await reader.read();
          }
          streamController.close();
        } catch (error) {
          streamController.error(error);
        }
      })();
    },
    cancel(reason) {
      controller.abort();
      return reader.cancel(reason).catch(() => {});
    }
  });

  return new Response(body, { status: upstream.status, headers: responseCorsHeaders });
}
