#!/usr/bin/env python3
"""Probe streams for Moldova, Russia and Romania; publish only verified HTTPS audio URLs."""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API_HOSTS = [
    "https://de1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
]
COUNTRIES = {"Moldova": "MD", "Russia": "RU", "Romania": "RO"}
OUT = Path("station-status.json")
USER_AGENT = "SolomudRadioHealthCheck/2.0"


def get_stations(code):
    last_error = None
    for host in API_HOSTS:
        try:
            req = urllib.request.Request(
                f"{host}/json/stations/bycountrycodeexact/{code}?hidebroken=true&limit=1000",
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                rows = json.loads(response.read().decode("utf-8"))
            if isinstance(rows, list):
                return rows
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Radio Browser API unavailable for {code}: {last_error}")


def probe(url):
    """A stream is accepted only if HTTPS returns bytes with an audio/playlist MIME type."""
    if not url or not url.lower().startswith("https://"):
        return False, None, "https-required"
    started = time.monotonic()
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Range": "bytes=0-1023",
            "Icy-MetaData": "0",
        })
        with urllib.request.urlopen(req, timeout=7) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            chunk = response.read(1)
            latency_ms = int((time.monotonic() - started) * 1000)
            audio_mime = any(token in content_type for token in (
                "audio/", "mpeg", "ogg", "aac", "mp4",
                "application/vnd.apple.mpegurl", "application/x-mpegurl",
                "application/octet-stream",
            ))
            if response.status >= 400 or not chunk:
                return False, latency_ms, "empty-response"
            if not audio_mime:
                return False, latency_ms, "not-audio"
            if latency_ms > 6000:
                return False, latency_ms, "slow"
            return True, latency_ms, "ok"
    except Exception as exc:
        return False, int((time.monotonic() - started) * 1000), type(exc).__name__


def main():
    checked_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    jobs = []
    country_stats = {}
    for country, code in COUNTRIES.items():
        rows = get_stations(code)
        country_stats[code] = {"discovered": len(rows), "tested": 0, "working": 0}
        for station in rows:
            uuid = station.get("stationuuid")
            if not uuid:
                continue
            candidates = list(dict.fromkeys(
                value for value in (station.get("url_resolved"), station.get("url"))
                if value and value.lower().startswith("https://")
            ))
            jobs.append((uuid, station.get("name", ""), country, code, candidates))

    def check(job):
        uuid, name, country, code, candidates = job
        best_latency = None
        last_reason = "https-required" if not candidates else "unavailable"
        for candidate in candidates:
            ok, latency, reason = probe(candidate)
            if latency is not None:
                best_latency = latency if best_latency is None else min(best_latency, latency)
            if ok:
                return uuid, {
                    "working": True, "latencyMs": latency, "streamUrl": candidate,
                    "reason": "ok", "name": name, "country": country,
                    "checkedAt": checked_at,
                }
            last_reason = reason
        return uuid, {
            "working": False, "latencyMs": best_latency, "streamUrl": None,
            "reason": last_reason, "name": name, "country": country,
            "checkedAt": checked_at,
        }

    statuses = {}
    with ThreadPoolExecutor(max_workers=32) as pool:
        futures = [pool.submit(check, job) for job in jobs]
        for future in as_completed(futures):
            uuid, result = future.result()
            statuses[uuid] = result
            code = next(code for code, country in ((v, k) for k, v in COUNTRIES.items()) if country == result["country"])
            country_stats[code]["tested"] += 1
            if result["working"]:
                country_stats[code]["working"] += 1

    OUT.write_text(json.dumps({
        "generatedAt": checked_at,
        "checked": len(statuses),
        "countries": country_stats,
        "stations": statuses,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_working = sum(item["working"] for item in statuses.values())
    print(f"Checked {len(statuses)} streams; {total_working} passed audio/HTTPS checks.")
    for code, stats in country_stats.items():
        print(f"{code}: {stats['working']} working / {stats['tested']} tested")


if __name__ == "__main__":
    main()
