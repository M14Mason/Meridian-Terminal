"""House periodic transaction reports (STOCK Act) from the Clerk's public bulk index.

Parses electronically filed PTR PDFs for stock trades (best effort); paper filings are listed with a
link only. Stores the last 365 days in the proxy cache. Never prints secrets.
"""
import io, json, os, re, sys, time, urllib.request, zipfile, datetime

PROXY = os.environ.get("PROXY_URL", "").rstrip("/")
ADMIN = os.environ.get("MERIDIAN_ADMIN_TOKEN")
if not PROXY or not ADMIN:
    print("missing env; skipping")
    sys.exit(0)
from pypdf import PdfReader  # noqa: E402  (installed by the workflow, pinned)

UA = {"User-Agent": "MeridianTerminal/1.0 (personal research; non-commercial)"}
BASE = "https://disclosures-clerk.house.gov/public_disc"
MAX_NEW = int(os.environ.get("MAX_PDFS", "120"))

TRADE = re.compile(
    r"\(([A-Z][A-Z0-9./]{0,7})\)\s*\[(ST|OP)\]\s*(P|S \(partial\)|S|E)\s+(\d\d/\d\d/\d{4})\s*(\d\d/\d\d/\d{4})\s*\$([\d,]+)\s*-\s*\$([\d,]+)"
)
OWNER = re.compile(r"(?:^|\s)(SP|JT|DC)\s")


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def cache(method, body=None):
    req = urllib.request.Request(f"{PROXY}/api/cache/congress", method=method, data=body,
                                 headers={"authorization": f"Bearer {ADMIN}", "content-type": "application/json", "user-agent": "MeridianTerminal-jobs/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if method == "GET" and e.code == 404:
            return None
        raise RuntimeError(f"cache {method} failed: {e.code}") from None


def parse_trades(text):
    flat = re.sub(r"\s+", " ", text)
    out, prev = [], 0
    for m in TRADE.finditer(flat):
        chunk = flat[prev:m.start()]
        owners = OWNER.findall(chunk[-200:])
        prev = m.end()
        lo, hi = int(m.group(6).replace(",", "")), int(m.group(7).replace(",", ""))
        out.append({"t": m.group(1).replace("/", "."), "kind": m.group(2), "type": m.group(3), "date": m.group(4),
                    "lo": lo, "hi": hi, "owner": owners[-1] if owners else "self"})
    return out


def members(year):
    z = zipfile.ZipFile(io.BytesIO(get(f"{BASE}/financial-pdfs/{year}FD.zip")))
    xml = z.read(f"{year}FD.xml").decode("utf-8-sig")
    for m in re.findall(r"<Member>(.*?)</Member>", xml, re.S):
        f = lambda t: (re.search(rf"<{t}>([^<]*)</{t}>", m) or [None, ""])[1].strip()
        if f("FilingType") != "P":
            continue
        mo, d, y = f("FilingDate").split("/")
        yield {"id": f("DocID"), "name": " ".join(x for x in [f("First"), f("Last"), f("Suffix")] if x), "dist": f("StateDst"),
               "filed": f"{y}-{int(mo):02d}-{int(d):02d}", "year": year}


today = datetime.date.today()
cutoff = (today - datetime.timedelta(days=365)).isoformat()
prev = cache("GET") or {"filings": []}
known = {f["id"]: f for f in prev.get("filings", [])}
rows = []
for year in sorted({today.year, (today - datetime.timedelta(days=365)).year}):
    rows.extend(r for r in members(year) if r["filed"] >= cutoff)
rows.sort(key=lambda r: r["filed"], reverse=True)

parsed = 0
out = []
for r in rows:
    r["url"] = f"{BASE}/ptr-pdfs/{r['year']}/{r['id']}.pdf"
    old = known.get(r["id"])
    if old is not None and old.get("trades") is not None:
        r["trades"] = old["trades"]
    elif not r["id"].startswith("2"):
        r["trades"] = None  # paper filing (scanned image): link only
    elif parsed < MAX_NEW:
        try:
            time.sleep(1)
            pdf = PdfReader(io.BytesIO(get(r["url"])))
            r["trades"] = parse_trades("\n".join(p.extract_text() or "" for p in pdf.pages))
        except Exception as e:  # keep going; retry next run
            print(f"parse failed {r['id']}: {type(e).__name__}")
            r["trades"] = None
        parsed += 1
    else:
        r["trades"] = None
    del r["year"]
    out.append(r)

body = json.dumps({"at": int(time.time() * 1000), "filings": out}).encode()
cache("PUT", body)
print(f"stored congress: {len(out)} filings, parsed {parsed} new, {len(body) // 1024} KB")
