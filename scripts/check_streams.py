#!/usr/bin/env python3
"""Check public Radio Browser streams and write a status map for the site."""
import json
import time
import urllib.request
import urllib.error
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
    if not url:
        return False
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "SolomudRadioStreamCheck/1.0",
                "Range": "bytes=0-2047",
                "Icy-MetaData": "0",
            })
            with urllib.request.urlopen(req, timeout=10) as response:
                chunk = response.read(2048)
                content_type = response.headers.get("Content-Type", "").lower()
                # Radio streams may be endless; any non-empty response is a positive probe.
                return response.status < 400 and (bool(chunk) or "audio" in content_type or "mpegurl" in content_type)
        except Exception:
            if attempt == 0:
                time.sleep(1)
    return False


def main():
    statuses = {}
    checked = 0
    for country, code in COUNTRIES.items():
        url = f"{API_HOSTS[0]}/json/stations/bycountrycodeexact/{code}?hidebroken=true&limit=1000"
        stations = get_json(url)
        for station in stations:
            stream = station.get("url_resolved") or station.get("url")
            uuid = station.get("stationuuid")
            if not stream or not uuid:
                continue
            statuses[uuid] = {
                "working": probe(stream),
                "name": station.get("name", ""),
                "country": country,
                "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            checked += 1
    OUT.write_text(json.dumps({
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "checked": checked,
        "stations": statuses,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    broken = sum(1 for item in statuses.values() if not item["working"])
    print(f"Checked {checked} stations; {broken} failed the stream probe.")


if __name__ == "__main__":
    main()
