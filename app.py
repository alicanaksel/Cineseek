"""
Cineseek – Flask application
- Serves pages (home, results, detail, watchlist)
- Talks to OMDb API with a robust requests session + lightweight file cache
- Exposes JSON endpoints used by the frontend (search, discover, spotlight, title_min)

NOTE: Put your OMDb API key in .env as OMDB_API_KEY=YOUR_KEY
"""

import os
import json
import time
from math import ceil
from pathlib import Path
from typing import Any, Dict, Optional

from flask import Flask, jsonify, render_template, request, send_file, abort
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

# ---------- Paths & App Setup ----------

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Load environment variables (OMDB_API_KEY expected)
load_dotenv(BASE_DIR / ".env")
API_KEY = os.getenv("OMDB_API_KEY", "")
if not API_KEY:
    print("[WARN] OMDB_API_KEY not found in .env — API calls will fail.")

app = Flask(__name__, template_folder=str(TEMPLATES_DIR), static_folder=str(STATIC_DIR))

# ---------- HTTP session with retries (more resilient to transient errors) ----------

session = requests.Session()
retries = Retry(
    total=3,
    backoff_factor=0.3,
    status_forcelist=[429, 500, 502, 503, 504],
)
session.mount("https://", HTTPAdapter(max_retries=retries))

# ---------- Tiny File Cache (JSON on disk) ----------

CACHE_TTL = 60 * 60 * 24  # 24 hours

def _cache_path(key: str) -> Path:
    """Return absolute path for a cache key (JSON)."""
    return CACHE_DIR / f"{key}.json"

def cache_get(key: str) -> Optional[Dict[str, Any]]:
    """Get a cached JSON object if fresh; otherwise return None."""
    p = _cache_path(key)
    if not p.exists():
        return None
    try:
        # Expire old cache entries
        if time.time() - p.stat().st_mtime > CACHE_TTL:
            return None
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def cache_set(key: str, data: Dict[str, Any]) -> None:
    """Write a JSON object to cache (best-effort)."""
    p = _cache_path(key)
    try:
        with p.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass  # fail silently; cache is optional

# ---------- OMDb helper ----------

class OmdbError(Exception):
    pass

def omdb_get(params: Dict[str, str]) -> Dict[str, Any]:
    """Call OMDb API with retries; raise on API or HTTP error."""
    url = "https://www.omdbapi.com/"
    q = {"apikey": API_KEY, **params}
    r = session.get(url, params=q, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data or data.get("Response") == "False":
        raise OmdbError(data.get("Error") or "Not found")
    return data

# ---------- Pages ----------

@app.get("/")
def index():
    """Homepage (Spotlight + chips + Discover grid)."""
    return render_template("index.html")

@app.get("/results")
def results():
    """
    Results page:
    - Backed by OMDb 's' (search) endpoint.
    - Supports client-side filtering for type/year range and simple pagination.
    """
    q = (request.args.get("q") or "").strip()
    page = max(int(request.args.get("page", 1)), 1)
    ty = request.args.get("type")  # 'movie' | 'series' | None
    ymin = request.args.get("ymin")
    ymax = request.args.get("ymax")

    if not q:
        return render_template("results.html", q=q, items=[], page=1, pages=1, total=0, ty=ty, ymin=ymin, ymax=ymax)

    try:
        data = omdb_get({"s": q, "page": str(page)})
    except Exception:
        data = {"Search": [], "totalResults": "0"}

    raw = data.get("Search") or []
    total = int(data.get("totalResults", "0")) if data.get("totalResults") else 0
    pages = max(ceil(total / 10), 1)

    def pass_filters(it: Dict[str, Any]) -> bool:
        if ty and it.get("Type") != ty:
            return False
        year = it.get("Year", "")
        try:
            y = int(str(year).split("–")[0])  # handle ranges like "2012–2014"
        except Exception:
            y = None
        if ymin and y and y < int(ymin):
            return False
        if ymax and y and y > int(ymax):
            return False
        return True

    items = [
        {
            "Title": it.get("Title"),
            "Year": it.get("Year"),
            "Type": it.get("Type"),
            "imdbID": it.get("imdbID"),
            "Poster": it.get("Poster") if it.get("Poster") and it.get("Poster") != "N/A" else None,
        }
        for it in raw if pass_filters(it)
    ]

    return render_template("results.html", q=q, items=items, page=page, pages=pages, total=total, ty=ty, ymin=ymin, ymax=ymax)

@app.get("/title/<imdb_id>")
def title_page(imdb_id: str):
    """Detail page (server-rendered) with data cached on disk."""
    key = f"title_{imdb_id}"
    data = cache_get(key)
    if not data:
        try:
            data = omdb_get({"i": imdb_id, "plot": "short"})
            cache_set(key, data)
        except Exception:
            abort(404)
    return render_template("detail.html", m=data)

@app.get("/download/<imdb_id>.json")
def download_json(imdb_id: str):
    """Download the OMDb JSON for a given title (convenience)."""
    key = f"title_{imdb_id}"
    data = cache_get(key)
    if not data:
        try:
            data = omdb_get({"i": imdb_id, "plot": "short"})
            cache_set(key, data)
        except Exception:
            abort(404)
    tmp = _cache_path(f"{imdb_id}_export")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return send_file(str(tmp), mimetype="application/json", as_attachment=True, download_name=f"{imdb_id}.json")

@app.get("/watchlist")
def watchlist_page():
    """
    Watchlist page (client-driven):
    - Reads IDs from localStorage (on the client).
    - Calls /api/title_min/<id> to render pretty cards.
    """
    return render_template("watchlist.html")

# ---------- JSON APIs used by the frontend ----------

@app.get("/api/search")
def api_search():
    """Autocomplete: returns up to 6 results for typed query."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"results": []})
    key = f"s_{q.lower()}_p1"
    data = cache_get(key)
    if not data:
        try:
            data = omdb_get({"s": q, "page": "1"})
            cache_set(key, data)
        except Exception:
            return jsonify({"results": []})

    items = [
        {
            "title": it.get("Title"),
            "year": it.get("Year"),
            "type": it.get("Type"),
            "id": it.get("imdbID"),
            "poster": it.get("Poster") if it.get("Poster") and it.get("Poster") != "N/A" else None,
        }
        for it in (data.get("Search") or [])
    ][:6]
    return jsonify({"results": items})

@app.get("/api/discover")
def api_discover():
    """
    Discover grid:
    - Optional ?seed=keyword to bias results (chips & shuffle use this).
    - Returns up to 18 cards.
    """
    import random
    seed = (request.args.get("seed") or "").strip().lower()
    SEEDS = [
        "star","love","war","night","girl","man","city","life","death","dark",
        "blue","red","king","queen","dream","time","space","world","road","home",
        "music","future","secret","fight","crime","family","school","summer","winter","doctor"
    ]
    if not seed:
        seed = random.choice(SEEDS)

    key = f"discover_{seed}"
    data = cache_get(key)
    if not data:
        try:
            data = omdb_get({"s": seed, "page": "1"})
            cache_set(key, data)
        except Exception:
            return jsonify({"results": []})

    items = [
        {
            "title": it.get("Title"),
            "year": it.get("Year"),
            "type": it.get("Type"),
            "id": it.get("imdbID"),
            "poster": it.get("Poster") if it.get("Poster") and it.get("Poster") != "N/A" else None,
        }
        for it in (data.get("Search") or [])
        if it.get("imdbID")
    ]
    random.shuffle(items)
    return jsonify({"results": items[:18]})

@app.get("/api/spotlight")
def api_spotlight():
    """
    Spotlight (hero):
    - Tries a few keywords and returns one 'strong' item with a poster + plot.
    - Falls back gracefully if OMDb is rate-limited or empty.
    """
    import random
    seeds = ["classic", "top", "award", "best", "epic", "space", "detective", "romance", "thriller"]
    for _ in range(4):
        seed = random.choice(seeds)
        try:
            res = omdb_get({"s": seed, "page": "1"})
            cand = [x for x in (res.get("Search") or []) if x.get("Poster") and x["Poster"] != "N/A"]
            if not cand:
                continue
            pick = random.choice(cand)
            full = omdb_get({"i": pick["imdbID"], "plot": "short"})
            return jsonify({
                "id": full.get("imdbID"),
                "title": full.get("Title"),
                "year": full.get("Year"),
                "type": full.get("Type"),
                "poster": full.get("Poster") if full.get("Poster") != "N/A" else None,
                "genre": full.get("Genre"),
                "plot": full.get("Plot"),
            })
        except Exception:
            continue
    return jsonify({"id": None})

@app.get("/api/title_min/<imdb_id>")
def api_title_min(imdb_id: str):
    """
    Minimal title info for watchlist page:
    - Uses cache + single title call to avoid heavy templates on the server.
    """
    key = f"title_{imdb_id}"
    data = cache_get(key)
    if not data:
        try:
            data = omdb_get({"i": imdb_id, "plot": "short"})
            cache_set(key, data)
        except Exception:
            return jsonify({"ok": False, "id": imdb_id})
    poster = data.get("Poster")
    return jsonify({
        "ok": True,
        "id": imdb_id,
        "title": data.get("Title"),
        "year": data.get("Year"),
        "poster": poster if poster and poster != "N/A" else None,
        "type": data.get("Type"),
        "genre": data.get("Genre"),
    })

# ---------- Run ----------

if __name__ == "__main__":
    # Debug server for local development
    app.run(debug=True)
