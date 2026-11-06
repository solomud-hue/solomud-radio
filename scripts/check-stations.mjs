const countries = ["MD", "RO", "RU"];
const hosts = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];
const timeoutMs = 10000;
const maxStationsPerCountry = 1000;

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function getStations(code) {
  for (const host of hosts) {
    try {
      const response = await fetchWithTimeout(
        `${host}/json/stations/bycountrycodeexact/${code}?hidebroken=true&limit=${maxStationsPerCountry}`,
        { headers: { "User-Agent": "SolomudRadioHealthCheck/1.0", Accept: "application/json" } }
      );
      if (!response.ok) continue;
      const rows = await response.json();
      if (Array.isArray(rows)) return rows;
    } catch {}
  }
  throw new Error(`Radio Browser unavailable for ${code}`);
}

async function testStream(station) {
  const candidates = [...new Set([station.url_resolved, station.url].filter(Boolean))];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const response = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "SolomudRadioHealthCheck/1.0",
          Range: "bytes=0-16383",
          "Icy-MetaData": "0"
        },
        redirect: "follow"
      });
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const type = (response.headers.get("content-type") || "").toLowerCase();
      const reader = response.body?.getReader();
      if (!reader) continue;
      const { value } = await reader.read();
      await reader.cancel().catch(() => {});
      const audioType = /audio|mpeg|ogg|aac|mp4|octet-stream|application\/vnd\.apple\.mpegurl/.test(type);
      if (value && value.byteLength > 0 && audioType) return true;
    } catch {}
  }
  return false;
}

const output = { checkedAt: new Date().toISOString(), countries: {}, stations: {} };
for (const code of countries) {
  const rows = await getStations(code);
  output.countries[code] = { discovered: rows.length, tested: 0, working: 0 };
  for (const station of rows) {
    if (!station.stationuuid) continue;
    const working = await testStream(station);
    output.stations[station.stationuuid] = { working, country: code, checkedAt: output.checkedAt };
    output.countries[code].tested++;
    if (working) output.countries[code].working++;
  }
}
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
