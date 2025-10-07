# Cineseek
A fast movie & TV finder with live suggestions and clean detail pages.

#### Demo Video
https://youtu.be/_7W5FG4eL5A

---

## Overview
**Cineseek** is a lightweight Flask application for quickly discovering movies and TV series. It focuses on speed and clarity:

- Live autocomplete shows up to six suggestions (with posters and years) while you type.
- The home page includes a **Discover** area with randomized poster grids for **Movies** and **TV Series** (with a **Shuffle** button).
- Each title opens to a clean detail page with poster, key metadata, plot, and ratings.
- If raw data is needed, there’s an optional **Download JSON** link per title.
- A dark, responsive UI and a simple server-side cache keep the experience snappy.

**Tech Stack:** Python, Flask, Jinja2, Vanilla JS/CSS, OMDb API

---

## Features
- **Smart Autocomplete:** Up to 6 suggestions with posters, years; keyboard navigation (↑/↓/Enter/Esc).
- **Discover Grids:** Randomized Movies & TV Series posters on the homepage + **Shuffle** to refresh.
- **Detail Page:** Poster, title, year, runtime, genres, cast, languages, country, plot, and ratings (e.g., IMDb).
- **Download JSON:** Get the raw OMDb record per title without cluttering the UI.
- **Dark, Responsive UI:** Works well on desktop and mobile.
- **Simple Caching:** File-based cache reduces OMDb calls and boosts perceived performance.

---

## Project Structure
```
cineseek/
  app.py
  templates/
    base.html        # shared layout (header with inline SVG logo, footer)
    index.html       # search bar, suggestions, Discover grids (Movies/Series)
    detail.html      # single-title detail card
  static/
    css/
      main.css       # dark theme, suggestions dropdown, grids, cards
    js/
      app.js         # autocomplete logic + discover shuffle
    logo/
      cineseek-logo-wordmark.svg
      cineseek-logo-icon.svg
      cineseek-icon-512.png
      cineseek-icon-192.png
  data/
    cache/           # auto-created JSON cache files
requirements.txt
```

---

## Getting Started

### 1) Set up environment
```bash
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows (PowerShell)
.venv\Scripts\activate
```

### 2) Install dependencies
```bash
pip install -r requirements.txt
```

### 3) Configure OMDb API key
You can use either approach:

**A) .env (recommended)**  
Create a file named `.env` at the **project root**:
```
OMDB_API_KEY=YOUR_OMDB_API_KEY
```

**B) Hardcoded (for local demo only)**  
`app.py` can fall back to a literal string (avoid committing real keys to public repos).

> Tip: Do **not** expose real API keys publicly. If a key is leaked, rotate it.

### 4) Run the app
```bash
python -m flask --app cineseek.app run --debug
```
Open: http://127.0.0.1:5000/

---

## How It Works (High Level)

- **Autocomplete:** Frontend debounces input and fetches `/api/search?q=...`. In-flight requests are cancelled to prevent stale dropdowns. The server calls OMDb (`s=`) and returns normalized results (title, year, type, imdbID, poster).

- **Discover:** On first load, the server builds a cached pool of titles from small “seed” searches (e.g., “star”, “night”, “lost”). Items without posters are skipped, duplicates are removed. Two random sets (Movies/Series) render on the homepage. **Shuffle** calls `/api/discover` to refresh.

- **Detail:** Navigating to `/title/<imdbID>` fetches the full entry (`i=`, `plot=full`) and renders a readable card with poster, metadata, plot, and ratings. A **Download JSON** link serves the cached raw record.

- **Caching:** A minimal file cache under `cineseek/data/cache/` stores search (≈12h), detail (≈7d), and discover pool (≈6h) responses to reduce API usage and improve responsiveness.

---

## Endpoints
- `GET /` – Homepage (search + Discover grids)
- `GET /api/search?q=<text>` – Autocomplete suggestions (max 6)
- `GET /api/discover` – Randomized Movies & Series picks
- `GET /title/<imdb_id>` – Title detail page
- `GET /download/<imdb_id>.json` – Raw JSON for that title (from cache)

---

## Design Decisions & Trade-offs
- **Server-side API calls** (vs. browser) keep the OMDb key private and enable caching/rate-limiting in one place.
- **Vanilla JS/CSS** keeps the client tiny and build-free; trade-off: fewer ready-made components.
- **File-based cache** is simple to ship locally; for multi-instance deployment, prefer Redis or another shared cache.
- **Seed-based Discover** gives variety without personalization; later you can add watchlist-based or collaborative recommendations.

---

## Known Limitations / Future Work
- No full results page with pagination/filters (could add “See all results”).
- No auth/watchlist yet; easy to add with Flask-Login + SQLAlchemy.
- No personalized recommendations; a content-based recommender (TF-IDF + cosine) would be a good next step.
- Posters are hot-linked; a proxy or image cache would reduce external requests.
- Production rate limiting (e.g., Nginx/Redis) not included.

---

## Acknowledgments
- Data by **OMDb API**  
- Flask/Jinja2 ecosystem  
- Posters, titles, and ratings belong to their respective owners
