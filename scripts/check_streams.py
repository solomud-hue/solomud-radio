#!/usr/bin/env python3
"""Check public Radio Browser streams and write a status map for the site."""
import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API_HOSTS = [
    "https://de1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
]
COUNTRIES = {"Moldova": "MD", "Russia": "RU", "Romania": "RO"}
OUT = Path("station-status.json")


def get_json(url):
    last_error = None
    for host in API_HOSTS:
        try:
            req = urllib.request.Request(url.replace(API_HOSTS[0], host),
                headers={"User-Agent": "SolomudRadioStreamCheck/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Radio Browser API unavailable: {last_error}")


def probe(url):
    """Return whether a browser-usable HTTPS stream responds quickly, plus latency."""
    if not url or not url.lower().startswith("https://"):
        return False, None, "https-required"
    started = time.monotonic()
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "SolomudRadioStreamCheck/1.0",
            "Range": "bytes=0-4095",
            "Icy-MetaData": "0",
        })
        with urllib.request.urlopen(req, timeout=6) as response:
            chunk = response.read(4096)
            latency_ms = int((time.monotonic() - started) * 1000)
            content_type = response.headers.get("Content-Type", "").lower()
            ok = response.status < 400 and bool(chunk)
            if not ok:
                return False, latency_ms, "empty-response"
            if latency_ms > 5500:
                return False, latency_ms, "slow"
            return True, latency_ms, "ok"
    except Exception as exc:
        return False, int((time.monotonic() - started) * 1000), type(exc).__name__

def main():
    statuses = {}
    checked = 0
    jobs = []
    checked_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for country, code in COUNTRIES.items():
        url = f"{API_HOSTS[0]}/json/stations/bycountrycodeexact/{code}?hidebroken=true&limit=1000"
        stations = get_json(url)
        for station in stations:
            uuid = station.get("stationuuid")
            if not uuid:
                continue
            candidates = list(dict.fromkeys(
                item for item in [station.get("url_resolved"), station.get("url")]
                if item and item.lower().startswith("https://")
            ))
            jobs.append((uuid, station.get("name", ""), country, candidates))

    def check_station(job):
        uuid, name, country, candidates = job
        if not candidates:
            return uuid, {
                "working": False, "latencyMs": None, "streamUrl": None,
                "reason": "https-required", "name": name, "country": country,
                "checkedAt": checked_at,
            }
        best_latency = None
        last_reason = "unavailable"
        for candidate in candidates:
            ok, latency_ms, reason = probe(candidate)
            if ok:
                return uuid, {
                    "working": True, "latencyMs": latency_ms, "streamUrl": candidate,
                    "reason": "ok", "name": name, "country": country,
                    "checkedAt": checked_at,
                }
            best_latency = latency_ms if best_latency is None else min(best_latency, latency_ms or best_latency)
            last_reason = reason
        return uuid, {
            "working": False, "latencyMs": best_latency, "streamUrl": None,
            "reason": last_reason, "name": name, "country": country,
            "checkedAt": checked_at,
        }

    with ThreadPoolExecutor(max_workers=24) as pool:
        futures = [pool.submit(check_station, job) for job in jobs]
        for future in as_completed(futures):
            uuid, status = future.result()
            statuses[uuid] = status
            checked += 1

    OUT.write_text(json.dumps({
        "generatedAt": checked_at,
        "checked": checked,
        "stations": statuses,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    working = sum(1 for item in statuses.values() if item["working"])
    slow = sum(1 for item in statuses.values() if item["reason"] == "slow")
    insecure = sum(1 for item in statuses.values() if item["reason"] == "https-required")
    print(f"Checked {checked} stations: {working} fast HTTPS streams, {slow} slow, {insecure} HTTP-only.")

if __name__ == "__main__":
    main()
