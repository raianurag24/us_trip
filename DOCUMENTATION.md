# US Trip — Project Documentation

A static, data-driven travel website for a 14-day US trip (San Francisco → Los Angeles → Las Vegas → Niagara Falls → Washington DC → New York City), May–June 2026.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Folder Structure](#2-folder-structure)
3. [Data Files](#3-data-files)
4. [Frontend Files](#4-frontend-files)
5. [JavaScript Functions Reference](#5-javascript-functions-reference)
6. [CSS Classes Reference](#6-css-classes-reference)
7. [Where to Make Changes](#7-where-to-make-changes)
8. [Full Itinerary Quick Reference](#8-full-itinerary-quick-reference)

---

## 1. Project Overview

| Property       | Value                                   |
|----------------|-----------------------------------------|
| Type           | Static website (HTML / CSS / JS)        |
| Build system   | None — served directly by any web server |
| Dev server     | `python3 -m http.server 8000` from root |
| URL (dev)      | http://localhost:8000/pages/index.html  |
| Data format    | JSON (fetched at runtime via `fetch()`) |
| Map library    | Leaflet 1.9.4 (CDN)                     |
| Cities         | SF · LA · LV · NF · DC · NY            |
| Days           | 14 (May 23 – June 5, 2026)              |

---

## 2. Folder Structure

```
us_trip/
├── data/
│   ├── activities.json   — every individual event (flights, hotels, visits, etc.)
│   ├── cities.json       — 6 city profiles with weather, clothing, hero image
│   ├── days.json         — 14-day itinerary; each day references activity IDs
│   ├── hotels.json       — 7 hotel profiles with coords & check-in/out
│   ├── transport.json    — full flight/train booking records with tracker URLs
│   └── venues.json       — 48 venue profiles with lat/lng for map modal
├── images/
│   ├── cities/
│   │   ├── las_vegas/hero.jpg
│   │   ├── los_angeles/hero.jpg
│   │   ├── new_york/hero.jpg
│   │   ├── niagara_falls/hero.jpg
│   │   ├── san_francisco/hero.jpg
│   │   └── washington_dc/hero.jpg
│   └── venues/
│       └── {venue_id}/   — 15 of 48 venues have photos (see §3.4)
├── pages/
│   ├── index.html        — homepage: all 14 days listed
│   └── day.html          — per-day detail page (?id=dayN)
├── scripts/
│   └── app.js            — all JS for both pages (~490 lines)
└── styles/
    └── styles.css        — all styles (~440 lines)
```

> **Important path note:** `pages/` is one level deeper than `data/` and `images/`, so all fetch paths and image URLs are prefixed with `../` via the `BASE = '../'` constant in `app.js`.

---

## 3. Data Files

### 3.1 `data/cities.json`

Root key: `cities` (array of 6 objects)

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique key: `sf`, `la`, `lv`, `nf`, `dc`, `ny` |
| `name` | string | Display name, e.g. `"San Francisco"` |
| `country` | string | Country name |
| `hero_image` | string | Relative path from project root, e.g. `images/cities/san_francisco/hero.jpg` |
| `description` | string | Short paragraph about the city |
| `why_special` | string | One-liner shown under city name in hero banner |
| `weather.expected_temp_day_c` | number | Daytime temperature in °C |
| `weather.expected_temp_evening_c` | number | Evening temperature in °C |
| `weather.conditions` | string | Weather description |
| `clothing.day` | string | Day clothing suggestion |
| `clothing.evening` | string | Evening clothing suggestion |
| `tips` | string[] | Array of practical travel tips |

**Used by:** `renderCityHero()`, `renderCityNav()`.

---

### 3.2 `data/days.json`

Root key: `days` (array of 14 objects)

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique key: `day1` … `day14` |
| `date` | string | ISO date `YYYY-MM-DD` |
| `city` | string | City ID (`sf`, `la`, `lv`, `nf`, `dc`, `ny`) or `"travel"` |
| `title` | string | Human-readable day title |
| `activities` | string[] | Ordered list of activity reference keys (see §3.3 resolution) |

**Activity reference resolution** (performed by `resolveActivity(ref, date, activities)`):
1. Look up `ref` as an explicit `id` field in activities array.
2. If not found, look for an activity with `venue_id === ref` AND `date === day.date`.
3. If still not found, look for `venue_id === ref` (date ignored).

---

### 3.3 `data/activities.json`

Root key: `activities` (array, ~50 entries)

#### Flight entry
```json
{
  "id": "flight_del_sfo",
  "type": "flight",
  "category": "international",
  "date": "2026-05-23",
  "time": "21:55",
  "from": "DEL",
  "to": "SFO",
  "flight_number": "SQ403",
  "airline": "Singapore Airlines"
}
```

#### Train entry
```json
{
  "id": "amtrak_nf_dc",
  "type": "train",
  "date": "2026-05-31",
  "time": "08:30",
  "from": "Niagara Falls",
  "to": "Washington DC",
  "operator": "Amtrak"
}
```

#### Hotel entry
```json
{
  "id": "hotel_sfo",
  "type": "hotel",
  "date": "2026-05-24",
  "time": "11:30",
  "hotel": "Hotel Spero",
  "city": "sf"
}
```
> Hotel `time` = check-in time. The hotel name is matched fuzzily to `hotels.json` via `findHotel()`.

#### Visit / Experience entry
```json
{
  "type": "visit",
  "date": "2026-05-24",
  "time": "14:15",
  "venue_id": "lombard_street",
  "duration_min": 20
}
```
> `visit` and `experience` activities have **no `id` field** — they are referenced by `venue_id` in `days.json`.  
> `experience` is used for immersive/ticketed activities (theme parks, cruises, helicopter rides, etc.).

**Flights with TBD details:** `flight_lax_las`, `flight_las_buf`, `flight_buf_dc` — airline and flight number still need to be filled in.

---

### 3.4 `data/venues.json`

Root: **bare array** `[...]` (no wrapper key).

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique key used in `activities.json` as `venue_id` |
| `name` | string | Display name |
| `city` | string | City ID |
| `image_folder` | string | Folder name under `images/venues/` (or null) |
| `why_special` | string | Brief tagline |
| `description` | string | Shown inside activity card |
| `tip` | string | Practical tip shown in card |
| `lat` | number | Latitude (enables map pin modal) |
| `lng` | number | Longitude |

**Venues with photos in `images/venues/`** (15 of 48):
`amnh`, `battery_spencer`, `brooklyn_bridge`, `central_park`, `dumbo`, `empire_state_building`, `friends_building`, `high_line`, `intrepid`, `lombard_street`, `pier_39`, `powell_cable_car`, `statue_of_liberty`, `summit`, `top_of_the_rock`.

---

### 3.5 `data/hotels.json`

Root key: `hotels` (array of 7 objects)

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique key |
| `name` | string | Hotel name (matched fuzzily from activities) |
| `city` | string | City ID |
| `location` | string | Neighbourhood / area |
| `address` | string? | Street address (optional) |
| `check_in` | string | Default check-in time |
| `check_out` | string | Checkout time |
| `early_checkin` | boolean? | Whether early check-in is arranged |
| `description` | string | Short description shown in card |
| `image_folder` | string | Under `images/` (unused in current UI) |
| `lat` | number | Latitude |
| `lng` | number | Longitude |

---

### 3.6 `data/transport.json`

Root key: `flights` (array). Contains full booking records with arrival times and tracking URLs. Primarily for reference; not yet rendered in the UI.

---

## 4. Frontend Files

### 4.1 `pages/index.html`

The **homepage**. Displays all 14 days as clickable cards.

**Structure:**
```html
<header class="site-header">
  <div class="inner">
    <div class="brand">…title, dates…</div>
    <nav id="cityNav" class="city-nav">…</nav>   ← populated by JS
  </div>
</header>
<main class="container">
  <div id="days-list" class="days-list">…</div>  ← populated by JS
</main>
<!-- image modal -->
```

**No city image grid** — images show only via the modal when clicking city pills.

---

### 4.2 `pages/day.html`

The **per-day detail page**, loaded as `day.html?id=dayN`.

**Structure:**
```html
<header class="site-header">…same as index…</header>

<div id="cityHero" class="city-hero hidden">…</div>  ← hero banner, shown by JS

<main class="container">
  <div class="day-header">
    <h2 id="dayTitle"></h2>
    <div id="dayDate" class="day-date"></div>
  </div>
  <div id="activityFilters" class="activity-filters"></div>  ← filter buttons
  <div id="activities" class="activity-list"></div>           ← cards + commute strips
</main>

<!-- image modal + map modal (Leaflet) -->
```

---

### 4.3 `scripts/app.js`

Single script for both pages. Auto-detects page by checking for `#days-list` (index) or `#activities` (day).

See §5 for full function reference.

---

### 4.4 `styles/styles.css`

Single stylesheet. See §6 for key class reference.

---

## 5. JavaScript Functions Reference

### Boot & Data Loading

| Function | Description |
|---|---|
| `boot()` | Entry point. Fetches all 5 JSON files in parallel, calls `renderCityNav()`, then the page-specific render function. |
| `load(path)` | `fetch(BASE + path)` helper, throws on non-OK responses. |

### City Navigation

| Function | Description |
|---|---|
| `renderCityNav(cities, days)` | Builds `<a class="city-pill">` elements in `#cityNav`. Each pill links to `day.html?id={firstDayOfCity}`. |

### Index Page

| Function | Description |
|---|---|
| `renderIndex({cities, days, ...})` | Renders 14 day cards in `#days-list` with date badge, city name, day title, activity count. |

### Day Page

| Function | Description |
|---|---|
| `renderDay({cities, days, activities, venues, hotels})` | Main day-page renderer. Finds the day from `?id=`, renders hero → prev/next → filter buttons → activity cards + commute strips → prev/next. |
| `renderCityHero(city)` | Sets `#cityHero` background image, overlays city name, weather, clothing, and "🔍 View photo" button. |
| `buildActivityCard(act, venues, hotels)` | Returns a `<div class="activity-card">` for any activity type. Sets `data-type` for filter targeting. |
| `buildDayNav(prevDay, nextDay)` | Returns a `<div class="day-nav">` with prev / next `<a>` buttons. |
| `buildFilterButtons(types, filtersEl, activitiesEl)` | Builds "All / ✈️ Flights / 🏨 Hotels / 🗺️ Sightseeing" toggle bar. Wires click handler to show/hide cards and commute strips. |
| `buildCommuteStrip(actA, actB, cityId)` | Returns a slim `<div class="commute-strip">` showing transport mode icon + label + estimated travel time between consecutive venue activities. |

### Helper / Utility

| Function | Description |
|---|---|
| `resolveActivity(ref, date, activities)` | Finds an activity by id, then venue_id+date, then venue_id alone. |
| `findHotel(name, hotels)` | Case-insensitive substring match of hotel name in hotels array. |
| `filterType(act)` | Maps activity.type → filter category (`visit`/`experience` → `"sightseeing"`, others pass through). |
| `isVenueAct(act)` | Returns true for visit or experience types. |
| `commuteInfo(cityId)` | Returns `{icon, label}` for the typical travel mode per city. |
| `venueIcon(venue, type)` | Returns a context-specific emoji for a venue (e.g. `'🦕'` for AMNH, `'🌉'` for Brooklyn Bridge). Falls back to `'🎟️'` (experience) or `'📍'` (visit). |
| `timeToMins(t)` | Parses `"HH:MM"` to total minutes since midnight. |
| `fmtDuration(mins)` | Formats minutes to `"1h 30m"` style string. |
| `formatShortDate(str)` | Formats `YYYY-MM-DD` to `"24 May"`. |
| `formatLongDate(str)` | Formats `YYYY-MM-DD` to `"Sunday, 24 May 2026"`. |
| `el(tag, cls)` | `document.createElement(tag)` shorthand with optional className. |

### Modals

| Function | Description |
|---|---|
| `openImageModal(src, caption)` | Shows `#imageModal` with the given image. |
| `openMapModal(venue)` | Shows `#mapModal`, initialises or repositions Leaflet map to venue lat/lng. |
| `initModals()` | Wires close buttons and Escape key for both modals. |

---

## 6. CSS Classes Reference

### Layout

| Class | Description |
|---|---|
| `.site-header` | Blue (`#2d6eaa`) header, position relative (not sticky) |
| `.inner` | Max-width container inside header |
| `.container` | Main content wrapper, 1080px max-width |
| `.city-nav` | Flex row of city pills, scrollable on mobile |
| `.city-pill` | Semi-transparent white pill, `<a>` link to first day of the city |

### City Hero (day page)

| Class | Description |
|---|---|
| `.city-hero` | Full-width 360px background-image banner |
| `.city-hero-overlay` | Gradient overlay (bottom-to-top dark) |
| `.city-hero-content` | Text container at bottom-left of overlay |
| `.city-hero-name` | Large city name (32px, bold) |
| `.hero-zoom-btn` | "🔍 View photo" frosted-glass button |

### Day Navigation

| Class | Description |
|---|---|
| `.day-nav` | Flex row with prev/next buttons |
| `.day-nav-btn` | Pill button, blue text, hides on `filter !== 'all'` |
| `.day-nav-btn.disabled` | Greyed out, pointer-events none |
| `.day-nav-prev` / `.day-nav-next` | Left/right alignment |

### Filter Bar

| Class | Description |
|---|---|
| `.activity-filters` | Flex row of filter buttons |
| `.filter-btn` | Outlined pill button |
| `.filter-btn.active` | Solid blue — the currently selected filter |

### Activity Cards

| Class | Description |
|---|---|
| `.activity-card` | Base card: white, rounded, left-colored border, `data-type` attribute |
| `.card-flight` | Blue left border |
| `.card-train` | Purple left border |
| `.card-hotel` | Green left border |
| `.card-visit` | Gold/amber left border |
| `.card-experience` | Red left border |
| `.ac-icon` | Emoji icon column |
| `.ac-body` | Main text column |
| `.ac-right` | Right column: duration badge + map button |
| `.ac-title` | Card heading |
| `.ac-sub` | Secondary info (grey, 13px) |
| `.ac-desc` | Description paragraph |
| `.ac-tip` | Tip text (italic, grey) |
| `.ac-duration` | Duration badge (`1h 30m`) |
| `.map-btn` | SVG map-pin button, triggers Leaflet modal |

### Commute Strips

| Class | Description |
|---|---|
| `.commute-strip` | Slim row between consecutive venue cards: icon · label · travel time |
| `.commute-icon` | Transport emoji |
| `.commute-label` | Mode label (e.g. "Subway / Walk") |
| `.commute-dur` | Estimated travel time (e.g. "~15m travel") |

---

## 7. Where to Make Changes

| Goal | File(s) to change |
|---|---|
| Add or edit a city (name, weather, clothing) | `data/cities.json` |
| Change the city hero photo | Replace `images/cities/{city}/hero.jpg` |
| Add a new day to the itinerary | `data/days.json` — add a day object with activity refs |
| Add an activity (venue visit) | `data/venues.json` (add venue) + `data/activities.json` (add visit entry) + `data/days.json` (add venue_id to the day) |
| Add/update flight details | `data/activities.json` + `data/transport.json` |
| Add/update hotel info | `data/hotels.json` |
| Change the activity card layout | `buildActivityCard()` in `scripts/app.js` + `.activity-card` rules in `styles/styles.css` |
| Change commute mode for a city | `commuteInfo()` in `scripts/app.js` |
| Add a new venue-specific icon | `venueIcon()` in `scripts/app.js` |
| Change header colour | `.site-header { background: ... }` in `styles/styles.css` |
| Change hero image height | `.city-hero { height: ... }` in `styles/styles.css` |
| Add a filter category | `filterType()` + `typeMap` inside `buildFilterButtons()` in `scripts/app.js` |
| Add venue photos | Create `images/venues/{venue_id}/` folder with images; wire up via `buildActivityCard()` |
| Add a new page | Create `pages/yourpage.html` mirroring `day.html` structure; `app.js` detects pages by element IDs |

---

## 8. Full Itinerary Quick Reference

| Day | Date | City | Title |
|---|---|---|---|
| Day 1 | Sat 23 May | Travel | Departure from Delhi |
| Day 2 | Sun 24 May | San Francisco | Arrival in San Francisco |
| Day 3 | Mon 25 May | San Francisco | Yosemite National Park Day Trip |
| Day 4 | Tue 26 May | Los Angeles | Hollywood and LA Skyline |
| Day 5 | Wed 27 May | Los Angeles | Disneyland |
| Day 6 | Thu 28 May | Las Vegas | Arrival in Las Vegas |
| Day 7 | Fri 29 May | Las Vegas | Vegas Experiences |
| Day 8 | Sat 30 May | Niagara Falls | Arrival in Niagara Falls |
| Day 9 | Sun 31 May | Niagara Falls | Niagara Falls Experiences |
| Day 10 | Mon 1 Jun | Washington DC | Arrival in Washington DC |
| Day 11 | Tue 2 Jun | New York City | Amtrak to NYC + Midtown Skyline |
| Day 12 | Wed 3 Jun | New York City | Statue of Liberty and Brooklyn |
| Day 13 | Thu 4 Jun | New York City | West Side Manhattan |
| Day 14 | Fri 5 Jun | New York City | Central Park and Museum |

### Flights & Trains

| Segment | Details |
|---|---|
| DEL → SFO | Singapore Airlines SQ403, 23 May 21:55 |
| SFO → LAX | Alaska Airlines AS1329, 26 May 09:57 |
| LAX → LAS | TBD, 28 May 08:45 |
| LAS → BUF | TBD, 30 May 07:00 |
| Niagara Falls → DC | Amtrak, 31 May 08:30 |
| DC → NYC | TBD flight, 2 Jun 10:00 |
| JFK → DEL | Lufthansa LH405, 5 Jun 21:50 |

### Hotels

| City | Hotel | Check-in | Check-out |
|---|---|---|---|
| San Francisco | Hotel Spero | Day 2 11:30 | Day 4 |
| Los Angeles | LA Airbnb | Day 4 13:30 | Day 6 |
| Las Vegas | Excalibur Hotel & Casino | Day 6 10:00 | Day 8 |
| Niagara Falls | Niagara Falls Hotel | Day 8 11:00 | Day 10 |
| Washington DC | Washington DC Hotel | Day 10 14:00 | Day 11 |
| New York (Queens) | Residence Inn Queens | Day 11 14:15 | Day 13 |
| New York (Times Square) | Motto by Hilton Times Square | Day 13 09:30 | Day 14 |
