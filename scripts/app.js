
/* ──────────────────────────────────────────────
   US Trip — app.js
   All pages share this single script.
   It detects which page is loaded and renders
   accordingly using pure fetch + DOM.
────────────────────────────────────────────── */

const isIndex   = !!document.getElementById('overview-grid');
const isWeather = !!document.getElementById('weather-detail');
const BASE      = isIndex ? '' : '../';
const DAY_PATH  = isIndex ? 'pages/day.html' : 'day.html';
const WEATHER_PATH = isIndex ? 'pages/weather.html' : 'weather.html';
const HOME_URL  = isIndex ? '#'              : '../index.html';

let leafletMap = null;
let leafletMarker = null;

// ── Boot ─────────────────────────────────────
async function boot() {
  const [cities, days, activities, venues, hotels, manifest] = await Promise.all([
    load('data/cities.json').then(d => d.cities || []),
    load('data/days.json').then(d => d.days || []),
    load('data/activities.json').then(d => d.activities || []),
    load('data/venues.json').then(d => Array.isArray(d) ? d : []),
    load('data/hotels.json').then(d => d.hotels || []),
    load('images/manifest.json').catch(() => ({})),
  ]);

  const data = { cities, days, activities, venues, hotels, manifest };

  renderCityNav(cities, days);

  if (document.getElementById('overview-grid')) renderIndex(data);
  if (document.getElementById('activities'))    renderDay(data);
  if (document.getElementById('weather-detail')) renderWeatherDetail(data);

  initModals();
}

function load(path) {
  return fetch(BASE + path, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.url); return r.json(); });
}

/** Return the image src for a venue/hotel/day/city folder, using manifest to find the actual filename. */
function imgPath(type, folder, manifest) {
  const file = (manifest && manifest[type] && manifest[type][folder]) || 'hero.jpg';
  return `${BASE}images/${type}/${folder}/${file}?v=43`;
}

function weatherDetailUrl(dayId) {
  return `${WEATHER_PATH}?id=${encodeURIComponent(dayId || '')}`;
}

// Build a canonical Live Flight Tracker URL for a flight activity.
// Uses `tracker_url` if provided, otherwise constructs a FlightAware URL
// from the flight number (uppercased, leading zeros removed).
function trackerUrlFor(flight) {
  if (!flight) return '#';
  // Known mappings from IATA (2-letter) / other prefixes to FlightAware's
  // expected airline prefixes (usually ICAO 3-letter codes).
  const prefixMap = {
    'SQ': 'SIA', // Singapore Airlines
    'LH': 'DLH', // Lufthansa
    'AS': 'ASA', // Alaska Airlines
    'DL': 'DAL', // Delta Airlines
    'UA': 'UAL', // United
    'AA': 'AAL', // American
    'WN': 'SWA', // Southwest
    // add more mappings as needed
  };

  if (flight.tracker_url) {
    let url = String(flight.tracker_url || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const u = new URL(url);
      if (u.hostname && u.hostname.includes('flightaware.com')) {
        // If the path contains a flight id, rewrite its airline prefix
        // using our mapping table (e.g., SQ32 -> SIA32).
        const m = u.pathname.match(/\/live\/flight\/([^\/\?#]+)/i);
        if (m && m[1]) {
          const fid = String(m[1] || '').toUpperCase();
          const f2 = fid.match(/^([A-Z]{2,3})0*(\d+)$/);
          if (f2) {
            const code = f2[1];
            const num = String(parseInt(f2[2], 10));
            const mapped = prefixMap[code] || code;
            return `https://www.flightaware.com/live/flight/${mapped}${num}`;
          }
        }
        u.hostname = 'www.flightaware.com';
        return u.toString();
      }
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  const fn = String(flight.flight_number || '').toUpperCase().replace(/\s+/g, '');
  if (!fn) return '#';
  const mm = fn.match(/^([A-Z]{2,3})0*(\d+)$/);
  if (mm) {
    const code = mm[1];
    const num = String(parseInt(mm[2], 10));
    const mapped = prefixMap[code] || code;
    return `https://www.flightaware.com/live/flight/${mapped}${num}`;
  }
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(fn)}`;
}

// ── CITY NAV (header — all pages) ───────────────
function renderCityNav(cities, days) {
  const nav = document.getElementById('cityNav');
  if (!nav) return;
  cities.forEach(city => {
    // find first day that belongs to this city
    const firstDay = days.find(d => d.city === city.id);
    const pill = el('a', 'city-pill');
    pill.textContent = city.name;
    if (firstDay) pill.href = `${DAY_PATH}?id=${firstDay.id}`;
    nav.appendChild(pill);
  });
  // — Day Itinerary pill — always navigates to home page
  const itinPill = el('a', 'city-pill city-pill--itinerary');
  itinPill.textContent = '📅 Itinerary';
  itinPill.href = HOME_URL;
  if (isIndex) {
    itinPill.addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  nav.appendChild(itinPill);}

// ── INDEX PAGE ────────────────────────────────
function renderIndex({ cities, days, venues, activities, hotels, manifest }) {
  renderOverview({ cities, days, manifest });
}

// ── OVERVIEW GRID (city-grouped tiles) ─────────────────────────
function renderOverview({ cities, days, manifest }) {
  const grid = document.getElementById('overview-grid');
  if (!grid) return;

  // Group days by city in itinerary order
  const groups = [];
  const seen = new Map();
  days.forEach(d => {
    if (!seen.has(d.city)) {
      const g = { cityId: d.city, days: [] };
      seen.set(d.city, g);
      groups.push(g);
    }
    seen.get(d.city).days.push(d);
  });

  groups.forEach(group => {
    const city     = cities.find(c => c.id === group.cityId);
    const isTravel = group.cityId === 'travel';
    const cityName = city ? city.name : (isTravel ? '✈️ Travel' : group.cityId);
    const heroPath = city ? BASE + city.hero_image : null;

    const section = el('div', 'city-group');

    // Section header
    const hdr = el('div', 'city-group-header');
    hdr.innerHTML = `
      <span class="city-group-name">${cityName}</span>
      <span class="city-group-count">${group.days.length} day${group.days.length > 1 ? 's' : ''}</span>`;
    section.appendChild(hdr);

    // Tile grid (2-col; single-day cities get a span-2 full-width tile)
    const tileGrid = el('div', 'day-tile-grid');
    group.days.forEach(day => {
      const tile = el('a', 'day-tile');
      tile.href  = `${DAY_PATH}?id=${day.id}`;

      if (group.days.length === 1) tile.classList.add('day-tile--full');

      // Per-day hero image, with city image as CSS fallback
      const dayImg  = imgPath('days', day.id, manifest);
      const cityImg = heroPath ? `, url('${heroPath}')` : '';
      tile.style.backgroundImage = `url('${dayImg}')${cityImg}`;

      tile.innerHTML = `
        <span class="day-tile-badge">${formatShortDate(day.date)}</span>
        <div class="day-tile-title">${day.title}</div>
        <div class="day-tile-count">${day.activities.length} activities</div>`;
      tileGrid.appendChild(tile);
    });
    section.appendChild(tileGrid);
    grid.appendChild(section);
  });
}

// ── DAY PAGE ──────────────────────────────────
function renderDay({ cities, days, activities, venues, hotels, manifest }) {
  const params  = new URLSearchParams(location.search);
  const dayId   = params.get('id');
  const dayIdx  = days.findIndex(d => d.id === dayId);
  const day     = days[dayIdx];
  if (!day) { document.getElementById('dayTitle').textContent = 'Day not found'; return; }

  const prevDay = dayIdx > 0              ? days[dayIdx - 1] : null;
  const nextDay = dayIdx < days.length-1  ? days[dayIdx + 1] : null;

  // Day hero (per-day image, city data for overlay text)
  const city = cities.find(c => c.id === day.city);
  renderDayHero(city, day, manifest);

  // Day header
  document.title = `${day.title} — US Trip`;
  document.getElementById('dayTitle').textContent = day.title;
  document.getElementById('dayDate').textContent = formatLongDate(day.date);

  // Day navigation (top)
  const container = document.getElementById('activities');
  container.appendChild(buildDayNav(prevDay, nextDay));

  // Determine flights referenced explicitly by this day's activity list
  // as well as flights scheduled for the day. This lets us render any
  // flights the user intentionally placed at the end of `day.activities`
  // (they should appear at the page bottom) while still showing
  // scheduled arrivals at the top.
  const flightsScheduled = activities.filter(a => a.type === 'flight' && (
    a.date === day.date || (a.arrival_note && a.arrival_note.includes(formatShortDate(day.date)))
  ));

  // Flights referenced directly in the day's activity ordering
  const flightsByRef = day.activities
    .map(ref => resolveActivity(ref, day.date, activities))
    .filter(Boolean)
    .filter(a => a.type === 'flight');

  // Identify a contiguous suffix of `day.activities` that are flights —
  // those belong at the bottom of the page (departures/connecting legs).
  const bottomIds = [];
  for (let i = day.activities.length - 1; i >= 0; i--) {
    const ra = resolveActivity(day.activities[i], day.date, activities);
    if (ra && ra.type === 'flight' && ra.id) bottomIds.push(ra.id);
    else break;
  }
  bottomIds.reverse();
  const bottomFlights = bottomIds.map(id => activities.find(a => a.id === id)).filter(Boolean);

  // Top flights: scheduled flights for the day, plus any referenced
  // flights that are not part of the bottom suffix.
  const topFlights = [];
  flightsScheduled.forEach(f => { if (!bottomIds.includes(f.id)) topFlights.push(f); });
  flightsByRef.forEach(f => { if (!bottomIds.includes(f.id) && !topFlights.some(t => t.id === f.id)) topFlights.push(f); });

  // For exclusion from the activity list below we use the combined set.
  const dayFlights = topFlights.concat(bottomFlights);

  // Render top-of-day flight widgets (incoming flights)
  if (topFlights.length > 0) {
    const topWidget = el('div');
    const parts = topFlights.map(f => {
        const title = `✈ ${f.airline || ''} ${f.flight_number || ''}`.trim();
        const subtitle = `${f.from || ''} → ${f.to || ''}`;
        const depCode = f.from || '';
        const depTime = f.time || '';
        const arrCode = f.to || '';
        const arrTime = f.arrival_time || '';
        const tracker = trackerUrlFor(f);
        return `
          <div class="flight-card">
            <div class="flight-title">${title}</div>
            <div class="flight-subtitle">${subtitle}</div>
            <div class="route-map">
              <div class="airport">
                <div class="code">${depCode}</div>
                <div class="time">${depTime}</div>
              </div>
              <div class="route-line"><div class="plane">✈</div></div>
              <div class="airport">
                <div class="code">${arrCode}</div>
                <div class="time">${arrTime}</div>
              </div>
            </div>
            <div class="flight-meta">${f.aircraft ? `Aircraft: ${f.aircraft}` : ''}</div>
            <div class="flight-buttons">
              <a href="${tracker}" target="_blank" rel="noopener">Live Flight Tracker</a>
              <a href="https://www.google.com/search?q=${encodeURIComponent((f.flight_number || '') + ' flight')}" target="_blank" rel="noopener">Google Flight Info</a>
            </div>
          </div>`;
      });
    const trackerLinks = topFlights.map(f => {
      const t = trackerUrlFor(f);
      return `<a href="${t}" target="_blank" rel="noopener">Open ${f.flight_number || f.airline} Tracker</a>`;
    }).join(' ');
    topWidget.innerHTML = parts.join('\n') + `<div class="flight-tracker" style="max-width:640px;margin:20px auto;padding:16px;text-align:center;">${trackerLinks}</div>`;
    container.appendChild(topWidget);
  }

  // Resolve all activities (filter nulls). Exclude any `flight` activities
  // that we already rendered as top-of-day widgets (so they don't show
  // twice on the same day page).
  const resolved = day.activities
    .map(ref => resolveActivity(ref, day.date, activities))
    .filter(Boolean)
    .filter(a => {
      if (a.type !== 'flight') return true;
      // `dayFlights` is computed above and contains flights for this day.
      if (Array.isArray(dayFlights) && dayFlights.length) {
        return !dayFlights.some(df => df.id && a.id && df.id === a.id);
      }
      return true;
    });

  // Filter buttons
  const filtersDiv = document.getElementById('activityFilters');
  const typeSet = new Set(resolved.map(a => filterType(a)));
  if (filtersDiv && typeSet.size > 1) {
    buildFilterButtons([...typeSet], filtersDiv, container);
  }

  // Activities + commute strips
  resolved.forEach((act, i) => {
    if (act.type === 'travel') {
      container.appendChild(buildTravelActStrip(act));
      return;
    }
    const card = buildActivityCard(act, venues, hotels, manifest);
    container.appendChild(card);
    const next = resolved[i + 1];
    if (next && isVenueAct(act) && isVenueAct(next)) {
      container.appendChild(buildCommuteStrip(act, next, day.city));
    }
  });

  // Render any departing flights that were intentionally placed at the
  // end of the day's activity list (e.g., return flights). These are
  // rendered after activities so they appear at the bottom of the page.
  if (typeof bottomFlights !== 'undefined' && bottomFlights.length > 0) {
    const bottomWidget = el('div');
    const parts = bottomFlights.map(f => {
      const title = `✈ ${f.airline || ''} ${f.flight_number || ''}`.trim();
      const subtitle = `${f.from || ''} → ${f.to || ''}`;
      const depCode = f.from || '';
      const depTime = f.time || '';
      const arrCode = f.to || '';
      const arrTime = f.arrival_time || '';
      const tracker = trackerUrlFor(f);
      return `
        <div class="flight-card">
          <div class="flight-title">${title}</div>
          <div class="flight-subtitle">${subtitle}</div>
          <div class="route-map">
            <div class="airport">
              <div class="code">${depCode}</div>
              <div class="time">${depTime}</div>
            </div>
            <div class="route-line"><div class="plane">✈</div></div>
            <div class="airport">
              <div class="code">${arrCode}</div>
              <div class="time">${arrTime}</div>
            </div>
          </div>
          <div class="flight-meta">${f.aircraft ? `Aircraft: ${f.aircraft}` : ''}</div>
          <div class="flight-buttons">
            <a href="${tracker}" target="_blank" rel="noopener">Live Flight Tracker</a>
            <a href="https://www.google.com/search?q=${encodeURIComponent((f.flight_number || '') + ' flight')}" target="_blank" rel="noopener">Google Flight Info</a>
          </div>
        </div>`;
    });
    const trackerLinks = bottomFlights.map(f => {
      const t = trackerUrlFor(f);
      return `<a href="${t}" target="_blank" rel="noopener">Open ${f.flight_number || f.airline} Tracker</a>`;
    }).join(' ');
    bottomWidget.innerHTML = parts.join('\n') + `<div class="flight-tracker" style="max-width:640px;margin:20px auto;padding:16px;text-align:center;">${trackerLinks}</div>`;
    container.appendChild(bottomWidget);
  }

  // Day navigation (bottom)
  container.appendChild(buildDayNav(prevDay, nextDay));
}

function renderWeatherDetail({ cities, days, activities, venues }) {
  const titleEl = document.getElementById('weatherTitle');
  const dateEl = document.getElementById('weatherDate');
  const host = document.getElementById('weather-detail');
  if (!host) return;

  const params = new URLSearchParams(location.search);
  const dayId = params.get('id') || (days[0] && days[0].id);
  const day = days.find(d => d.id === dayId);

  if (!day) {
    if (titleEl) titleEl.textContent = 'Weather details not found';
    host.innerHTML = `<div class="weather-summary-card"><p class="weather-muted">No day selected. Please open this page from a day itinerary.</p></div>`;
    return;
  }

  const city = cities.find(c => c.id === day.city);
  const dayActs = day.activities
    .map(ref => resolveActivity(ref, day.date, activities))
    .filter(Boolean);
  const venueMap = new Map((venues || []).map(v => [v.id, v]));
  const venueActs = dayActs
    .filter(a => a.venue_id)
    .map(a => ({ ...a, venue: venueMap.get(a.venue_id) }))
    .filter(a => a.venue);

  document.title = `${day.title} — Weather & Outfit Guide`;
  if (titleEl) titleEl.textContent = `${day.title} · Weather + Outfit Planner`;
  if (dateEl) dateEl.textContent = formatLongDate(day.date);

  if (!city) {
    host.innerHTML = `<div class="weather-summary-card"><p class="weather-muted">This day is a travel day without a specific city forecast.</p></div>`;
    return;
  }

  const forecast = buildDayPartForecast(city, day.date);
  const outfit = buildOutfitDetails(city, day, venueActs, forecast);

  const dayPartHtml = forecast.map(p => `
    <div class="daypart-card">
      <div class="daypart-head">
        <span class="daypart-icon">${p.icon}</span>
        <div>
          <div class="daypart-name">${p.slot}</div>
          <div class="daypart-temp">${p.range}</div>
        </div>
      </div>
      <p>${p.detail}</p>
    </div>
  `).join('');

  const dayVenueNames = venueActs.map(a => a.venue && a.venue.name).filter(Boolean);
  const venuePreview = dayVenueNames.slice(0, 6).map(n => `<span class="venue-chip">${n}</span>`).join('');

  host.innerHTML = `
    <section class="weather-summary-card">
      <div class="weather-summary-top">
        <div>
          <h3>📍 ${city.name} · ${formatShortDate(day.date)}</h3>
          <p class="weather-muted">${city.weather.conditions}</p>
        </div>
        <a class="day-nav-home" href="${DAY_PATH}?id=${day.id}">← Back to itinerary</a>
      </div>
      ${venuePreview ? `<div class="venue-chip-row">${venuePreview}</div>` : ''}
    </section>

    <section class="weather-layout">
      <article class="weather-forecast-card">
        <h3>🌤 Weather by day-part</h3>
        <p class="weather-muted">A quick practical view for morning, afternoon, evening and night.</p>
        <div class="daypart-grid">${dayPartHtml}</div>
      </article>

      <article class="clothing-deep-card">
        <h3>🧥 Detailed outfit strategy (priority)</h3>
        <p class="weather-muted">${outfit.summary}</p>

        <div class="clothing-columns">
          <div class="clothing-block">
            <h4>👔 Men · Day</h4>
            ${renderBulletList(outfit.menDay)}
          </div>
          <div class="clothing-block">
            <h4>👠 Women · Day</h4>
            ${renderBulletList(outfit.womenDay)}
          </div>
          <div class="clothing-block">
            <h4>🌆 Men · Evening/Night</h4>
            ${renderBulletList(outfit.menEve)}
          </div>
          <div class="clothing-block">
            <h4>✨ Women · Evening/Night</h4>
            ${renderBulletList(outfit.womenEve)}
          </div>
        </div>

        <div class="clothing-block">
          <h4>👟 Footwear + essentials</h4>
          ${renderBulletList(outfit.essentials)}
        </div>
        <div class="clothing-block">
          <h4>🎯 Vibe upgrades for today's places</h4>
          ${renderBulletList(outfit.vibeUpgrades)}
        </div>
      </article>
    </section>
  `;
}

function renderBulletList(items) {
  const safe = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safe.length) return '';
  return `<ul class="weather-bullets">${safe.map(i => `<li>${i}</li>`).join('')}</ul>`;
}

function buildDayPartForecast(city, dateStr) {
  const baseDay = Number((city && city.weather && city.weather.expected_temp_day_c) || 22);
  const baseEve = Number((city && city.weather && city.weather.expected_temp_evening_c) || (baseDay - 5));
  const d = new Date(`${dateStr}T00:00:00`);
  const shift = (d.getDate() % 3) - 1;

  let morning = [Math.round(baseEve - 2 + shift), Math.round(baseEve + shift)];
  let afternoon = [Math.round(baseDay - 1 + shift), Math.round(baseDay + 2 + shift)];
  let evening = [Math.round(baseEve - 1 + shift), Math.round(baseDay - 2 + shift)];
  let night = [Math.round(baseEve - 4 + shift), Math.round(baseEve - 1 + shift)];

  if (city.id === 'lv') {
    afternoon = [afternoon[0] + 2, afternoon[1] + 4];
    night = [night[0] - 2, night[1] - 1];
  }
  if (city.id === 'sf') {
    morning = [morning[0] - 1, morning[1] - 1];
    evening = [evening[0] - 1, evening[1] - 1];
  }
  if (city.id === 'nf') {
    morning = [morning[0] - 1, morning[1] - 1];
    evening = [evening[0] - 1, evening[1] - 1];
  }

  const textByCity = {
    sf: {
      morning: 'Cool marine-layer start; a mild windbreaker helps right away.',
      afternoon: 'Pleasant sunshine appears, but bay breezes can still feel crisp in shade.',
      evening: 'Wind picks up around waterfront viewpoints; layer up before sunset.',
      night: 'Chilly pockets between hills and waterfront corridors.'
    },
    la: {
      morning: 'Comfortable and bright; easy start for outdoor sightseeing.',
      afternoon: 'Warm and sunny; strongest UV window of the day.',
      evening: 'Golden-hour comfort, then a light cool-down after dark.',
      night: 'Mostly mild with occasional coastal breeze.'
    },
    lv: {
      morning: 'Dry desert warmth starts early and climbs quickly.',
      afternoon: 'Peak heat window; direct sun feels much hotter than the thermometer.',
      evening: 'Still warm outside, with strong A/C contrast indoors.',
      night: 'Comfortable night air for Strip walks and viewpoints.'
    },
    nf: {
      morning: 'Mild morning near town, cooler near the falls spray.',
      afternoon: 'Comfortable temperatures, but mist keeps surfaces damp.',
      evening: 'Cooler around gorge viewpoints and boat docks.',
      night: 'Fresh and damp; wind can pick up near open water.'
    },
    dc: {
      morning: 'Pleasant start, good for monument walks before crowds.',
      afternoon: 'Warm and slightly humid; hydrate during long outdoor stretches.',
      evening: 'Comfortable sunset weather around the memorials.',
      night: 'Mild with occasional breeze on open plazas.'
    },
    ny: {
      morning: 'Comfortable city-walk weather; light layers are ideal.',
      afternoon: 'Warmest part of the day; concrete and sunlight amplify heat.',
      evening: 'Great outdoor vibe for skyline walks and rooftop views.',
      night: 'Pleasant overall, but breezier around riverfront spots.'
    }
  };

  const tx = textByCity[city.id] || textByCity.ny;
  const range = ([a, b]) => `${a}–${b}°C`;

  return [
    { slot: 'Morning', icon: '🌅', range: range(morning), detail: tx.morning },
    { slot: 'Afternoon', icon: '☀️', range: range(afternoon), detail: tx.afternoon },
    { slot: 'Evening', icon: '🌇', range: range(evening), detail: tx.evening },
    { slot: 'Night', icon: '🌙', range: range(night), detail: tx.night },
  ];
}

function buildOutfitDetails(city, day, venueActs, forecast) {
  const names = venueActs.map(a => (a.venue && a.venue.name) || '').filter(Boolean);
  const joined = names.join(' | ').toLowerCase();
  const warmest = Math.max(...forecast.map(f => Number(String(f.range).split('–')[1].replace('°C', ''))));
  const coolest = Math.min(...forecast.map(f => Number(String(f.range).split('–')[0])));

  const needsWaterproof = /(falls|mist|cruise|pier|battery|liberty|island|dumbo)/i.test(joined);
  const longWalkDay = names.length >= 4 || /(park|bridge|line|street|square|valley|museum)/i.test(joined);
  const windyStops = /(bridge|battery|top|rock|summit|observatory|helicopter|waterfront)/i.test(joined) || city.id === 'sf';
  const photoNight = /(times square|strip|empire|rock|summit|fremont|observatory)/i.test(joined);

  const summary = `Temps swing from about ${coolest}°C to ${warmest}°C, so styling this day is all about flexible layering. Keep the base breathable, then level up with a light outer layer and footwear that can handle long walking blocks.`;

  const menDay = [
    `Breathable tee or polo + lightweight overshirt so you can adapt quickly as temperature shifts through the day.`,
    `Stretch chinos or technical travel pants for comfort during transit + sightseeing photos.`,
    longWalkDay ? `Cushioned sneakers (all-day pair) are a must — this itinerary has sustained walking.` : `Clean sneakers are ideal for comfort and a polished city look.`,
    `Packable cap + sunglasses for midday glare and open viewpoints.`
  ];

  const womenDay = [
    `Breathable top (cotton/linen blend) with a light layer (shirt-jacket or cropped jacket) for quick temperature changes.`,
    `Comfortable bottoms (flowy trousers, relaxed jeans, or active dress with shorts) that stay photo-ready and movement-friendly.`,
    longWalkDay ? `Supportive sneakers/sporty flats are strongly recommended — this is a high-step day.` : `Comfort-focused stylish sneakers or flats will carry well through the day.`,
    `Light scarf or shawl works as both style accent and breeze shield.`
  ];

  const menEve = [
    windyStops ? `Add a windproof shell or structured lightweight jacket for waterfront/height viewpoints.` : `Swap to a cleaner overshirt or lightweight jacket to sharpen the evening look.`,
    photoNight ? `Choose darker neutrals for stronger night photos and skyline backgrounds.` : `Keep tones layered (charcoal/navy/olive) for an easy day-to-evening transition.`,
    `Carry one dry tee/socks pair in your day bag to reset after long walks.`
  ];

  const womenEve = [
    windyStops ? `Bring a slightly warmer topper (knit blazer/light trench) so sunset wind does not cut the evening short.` : `Move to a dressier layer (soft blazer/light knit) for a polished evening vibe.`,
    photoNight ? `Metallic or textured accent (bag/jewelry/lip color) pops beautifully in night city lighting.` : `Choose one statement accessory to lift the look without extra bulk.`,
    `Keep a compact foldable layer in your tote for indoor A/C and late-night cool-down.`
  ];

  const essentials = [
    `SPF + sunglasses + reusable water bottle (especially critical in midday windows).`,
    needsWaterproof ? `Water-resistant layer/poncho + quick-dry phone pouch for mist/spray-heavy stops.` : `Small umbrella or shell is enough for occasional wind/chill.`,
    `Blister-prevention strips + comfortable socks: this saves the evening plan on long walking days.`,
    `Crossbody/daypack with room for one extra layer and hydration.`
  ];

  const vibeUpgrades = [
    `Day mood: explorer-chic — practical comfort first, then one style accent for photos.`,
    names.length ? `Today's highlights (${names.slice(0, 4).join(', ')}) are best enjoyed in movement-friendly outfits.` : `Keep it flexible: this day mixes transit, views, and neighborhood walking.`,
    `Evening mood: slightly elevated but still walkable — aim for “smart travel” not formalwear.`
  ];

  return { summary, menDay, womenDay, menEve, womenEve, essentials, vibeUpgrades };
}

function renderDayHero(city, day, manifest) {
  const hero     = document.getElementById('cityHero');
  const dayImgSrc = imgPath('days', day.id, manifest);
  // Fallback to city image if available
  const fallbackSrc = city ? BASE + city.hero_image : null;

  hero.className = 'city-hero';
  hero.style.backgroundImage = fallbackSrc
    ? `url('${dayImgSrc}'), url('${fallbackSrc}')`
    : `url('${dayImgSrc}')`;

  const name    = city ? city.name : (day.city === 'travel' ? 'Travel Day' : day.title);
  const why     = city ? (city.why_special || '') : '';
  const meta    = city
    ? `${weatherIcon()} ${city.weather.expected_temp_day_c}°C day · ${city.weather.expected_temp_evening_c}°C eve &nbsp;·&nbsp; ${city.weather.conditions}`
    : '';
  const clothing = city
    ? `👕 ${city.clothing.day} &nbsp;·&nbsp; 🧥 ${city.clothing.evening}`
    : '';
  const weatherHref = weatherDetailUrl(day.id);

  hero.innerHTML = `
    <div class="city-hero-overlay">
      <div class="city-hero-content">
        <h1 class="city-hero-name">${name}</h1>
        ${why ? `<p class="city-hero-why">${why}</p>` : ''}
        ${meta ? `<a class="city-hero-meta hero-detail-link" href="${weatherHref}" aria-label="Open detailed weather and clothing plan">${meta}</a>` : ''}
        ${clothing ? `<a class="city-hero-clothing hero-detail-link" href="${weatherHref}" aria-label="Open detailed weather and clothing plan">${clothing}</a>` : ''}
        <div class="hero-actions">
          <a class="hero-weather-btn" href="${weatherHref}" aria-label="Open detailed weather and clothing plan">🌦 Detailed Weather + Outfit Plan</a>
          <button class="hero-zoom-btn" aria-label="View full image">🔍 View photo</button>
        </div>
      </div>
    </div>`;
  hero.querySelector('.hero-zoom-btn').addEventListener('click', () => openImageModal(dayImgSrc, day.title));
}

// ── Activity card builder ─────────────────────
function buildActivityCard(act, venues, hotels, manifest) {
  const card = el('div', 'activity-card');
  card.dataset.type = filterType(act);

  if (act.type === 'flight') {
    card.classList.add('card-flight');
    const title = `✈ ${act.airline || ''} ${act.flight_number || ''}`.trim();
    const subtitle = `${act.from || ''} → ${act.to || ''}`;
    const depTime = act.time || '';
    const arrTime = act.arrival_time || '';
    const aircraft = act.aircraft || '';
    const baggage = act.baggage || act.baggage_allowance || '';
    const tracker = trackerUrlFor(act);
    const meta = [aircraft ? `Aircraft: ${aircraft}` : '', baggage ? `Baggage: ${baggage}` : '', act.category ? (act.category === 'international' ? '🌍 International' : '✈️ Domestic') : ''].filter(Boolean).join('<br>');

    card.innerHTML = `
      <div class="flight-card">
        <div class="flight-title">${title}</div>
        <div class="flight-subtitle">${subtitle}</div>
        <div class="route-map">
          <div class="airport">
            <div class="code">${act.from || ''}</div>
            <div class="time">${depTime}</div>
          </div>
          <div class="route-line"><div class="plane">✈</div></div>
          <div class="airport">
            <div class="code">${act.to || ''}</div>
            <div class="time">${arrTime}</div>
          </div>
        </div>
        <div class="flight-meta">${meta}</div>
        <div class="flight-buttons">
          <a href="${tracker}" target="_blank" rel="noopener">Live Flight Tracker</a>
          <a href="https://www.google.com/search?q=${encodeURIComponent((act.flight_number || '') + ' flight')}" target="_blank" rel="noopener">Google Flight Info</a>
        </div>
      </div>`;
    return card;
  }

  if (act.type === 'train') {
    card.classList.add('card-train');
    const times = act.arrival_time ? `${act.time} → ${act.arrival_time}` : `Departs ${act.time}`;
    const trainInfo = [act.operator, act.train_number ? `Train ${act.train_number}` : ''].filter(Boolean).join(' · ');
    card.innerHTML = `
      <div class="ac-icon">🚆</div>
      <div class="ac-body">
        <div class="ac-title">${act.from} → ${act.to}</div>
        <div class="ac-sub">${trainInfo}</div>
        <div class="ac-sub">${times}</div>
      </div>`;
    return card;
  }

  if (act.type === 'hotel') {
    const hotel = findHotel(act.hotel_id, act.hotel, hotels);
    card.classList.add('card-hotel');

    const body = el('div', 'ac-body');
    let bodyHtml = `<div class="ac-title">${act.hotel}</div>`;
    if (hotel) {
      if (hotel.location || hotel.address) {
        bodyHtml += `<div class="ac-sub">📍 ${[hotel.location, hotel.address].filter(Boolean).join(' · ')}</div>`;
      }
      bodyHtml += `<div class="ac-sub">Check-in: ${act.time || hotel.check_in || ''} &nbsp;·&nbsp; Check-out: ${hotel.check_out || ''}</div>`;
      const linkUrl = hotel.website_url || hotel.maps_url;
      const linkLabel = hotel.website_url ? '🌐 View hotel →' : '🗺️ View on map →';
      if (linkUrl) bodyHtml += `<a href="${linkUrl}" target="_blank" rel="noopener" class="hotel-link">${linkLabel}</a>`;
    } else {
      bodyHtml += `<div class="ac-sub">Check-in: ${act.time || ''}</div>`;
    }
    body.innerHTML = bodyHtml;

    const icon = el('div', 'ac-icon');
    icon.textContent = '🏨';
    card.appendChild(icon);
    card.appendChild(body);

    // Hotel photo thumbnail
    if (hotel && hotel.image_folder) {
      const imgSrc = imgPath('hotels', hotel.image_folder, manifest);
      const right = el('div', 'ac-right');
      const thumb = el('div', 'venue-thumb');
      thumb.style.backgroundImage = `url('${imgSrc}')`;
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `View photo: ${act.hotel}`);
      thumb.addEventListener('click', () => openImageModal(imgSrc, act.hotel));
      right.appendChild(thumb);
      card.appendChild(right);
    }
    if (hotel && hotel.description) {
      const descEl = el('div', 'ac-desc ac-desc-row');
      descEl.textContent = hotel.description;
      card.appendChild(descEl);
    }
    return card;
  }

  if (act.type === 'visit' || act.type === 'experience') {
    const venue = venues.find(v => v.id === act.venue_id) || { name: act.venue_id, lat: null, lng: null };
    card.classList.add(act.type === 'experience' ? 'card-experience' : 'card-visit');
    if (venue.image_folder) card.classList.add('card-has-photo');

    const left = el('div', 'ac-body');
    const durTxt = act.duration_min ? ` <span class="ac-dur-inline">(${fmtDuration(act.duration_min)})</span>` : '';
    const query = encodeURIComponent(venue.name || act.venue_id);
    const ytUrl = `https://www.youtube.com/results?search_query=${query}`;
    left.innerHTML = `
      <div class="ac-title"><a href="${ytUrl}" target="_blank" rel="noopener noreferrer">${venue.name || act.venue_id}</a>${durTxt}</div>
      <div class="ac-sub">${act.time || ''}</div>
      ${venue.tip ? `<div class="ac-tip">💡 ${venue.tip}</div>` : ''}`;

    // Map link inline in body
    if (venue.lat != null && venue.lng != null) {
      const mapBtn = el('button', 'map-link');
      mapBtn.setAttribute('aria-label', `Map: ${venue.name}`);
      mapBtn.innerHTML = `📍 Open on map`;
      mapBtn.addEventListener('click', () => openMapModal(venue));
      left.appendChild(mapBtn);
    }

    const right = el('div', 'ac-right');

    // Venue photo thumbnail
    if (venue.image_folder) {
      const imgSrc = imgPath('venues', venue.image_folder, manifest);
      const thumb  = el('div', 'venue-thumb');
      thumb.style.backgroundImage = `url('${imgSrc}')`;
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `View photo: ${venue.name}`);
      thumb.addEventListener('click', () => openImageModal(imgSrc, venue.name));
      right.appendChild(thumb);
    }

    if (act.duration_min) {
      // duration already in title — skip separate span
    }

    const icon = el('div', 'ac-icon');
    icon.textContent = venueIcon(venue, act.type);

    card.appendChild(icon);
    card.appendChild(left);
    card.appendChild(right);
    if (venue.description) {
      const descEl = el('div', 'ac-desc ac-desc-row');
      descEl.textContent = venue.description;
      card.appendChild(descEl);
    }
    return card;
  }

  if (act.type === 'travel') {
    const modeIcon = act.mode === 'uber' ? '🚗' : '🚌';
    const modeLabel = act.mode === 'uber' ? 'Uber' : (act.mode || 'Transfer');
    const durTxt = act.duration_min ? ` · ~${fmtDuration(act.duration_min)}` : '';
    card.classList.add('card-travel');
    card.innerHTML = `
      <div class="ac-icon">${modeIcon}</div>
      <div class="ac-body">
        <div class="ac-title">${act.from} → ${act.to}</div>
        <div class="ac-sub">${modeLabel}${durTxt} · Departs ${act.time || ''}</div>
        ${act.note ? `<div class="ac-desc">${act.note}</div>` : ''}
      </div>`;
    return card;
  }

  if (act.type === 'note') {
    card.classList.add('card-note');
    card.innerHTML = `
      <div class="ac-icon">${act.icon || 'ℹ️'}</div>
      <div class="ac-body">
        <div class="ac-title">${act.title || ''}</div>
        ${act.body ? `<div class="ac-desc">${act.body}</div>` : ''}
      </div>`;
    return card;
  }

  // Fallback
  card.innerHTML = `<div class="ac-body"><div class="ac-title">${act.id || act.type || JSON.stringify(act)}</div></div>`;
  return card;
}

// ── Helpers ───────────────────────────────────
function resolveActivity(ref, date, activities) {
  // by explicit id
  let a = activities.find(x => x.id === ref);
  if (a) return a;
  // by venue_id + date
  a = activities.find(x => x.venue_id === ref && x.date === date);
  if (a) return a;
  // by venue_id alone
  a = activities.find(x => x.venue_id === ref);
  return a || null;
}

function findHotel(hotelId, hotelName, hotels) {
  if (!hotels) return null;
  // Direct ID match first
  if (hotelId) {
    const byId = hotels.find(h => h.id === hotelId);
    if (byId) return byId;
  }
  // Name substring fallback
  if (!hotelName) return null;
  const n = hotelName.toLowerCase();
  return hotels.find(h => h.name && h.name.toLowerCase().includes(n.substring(0, 12))) || null;
}

function fmtDuration(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
}

function formatShortDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatLongDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildDayNav(prevDay, nextDay) {
  const nav = el('div', 'day-nav');

  // Full Itinerary button — centred above prev/next
  const homeBtn = el('a', 'day-nav-home');
  homeBtn.href = HOME_URL;
  homeBtn.textContent = '⊞ Full Itinerary';
  nav.appendChild(homeBtn);

  // Prev / Next row
  const row = el('div', 'day-nav-row');
  const prevLink = el('a', 'day-nav-btn day-nav-prev');
  const nextLink = el('a', 'day-nav-btn day-nav-next');
  if (prevDay) {
    prevLink.href = `${DAY_PATH}?id=${prevDay.id}`;
    prevLink.innerHTML = `‹ <span>${prevDay.title}</span>`;
  } else {
    prevLink.classList.add('disabled');
    prevLink.innerHTML = `‹ <span>First day</span>`;
  }
  if (nextDay) {
    nextLink.href = `${DAY_PATH}?id=${nextDay.id}`;
    nextLink.innerHTML = `<span>${nextDay.title}</span> ›`;
  } else {
    nextLink.classList.add('disabled');
    nextLink.innerHTML = `<span>Last day</span> ›`;
  }
  row.appendChild(prevLink);
  row.appendChild(nextLink);
  nav.appendChild(row);
  return nav;
}

// ── Filter helpers ─────────────────────────────
function filterType(act) {
  if (act.type === 'visit' || act.type === 'experience') return 'sightseeing';
  if (act.type === 'travel') return 'travel';
  return act.type;
}

function isVenueAct(act) {
  return act.type === 'visit' || act.type === 'experience';
}

function buildFilterButtons(types, filtersEl, activitiesEl) {
  const typeMap = {
    flight:      { icon: '✈️',  label: 'Flights' },
    train:       { icon: '🚆',  label: 'Trains' },
    hotel:       { icon: '🏨',  label: 'Hotels' },
    sightseeing: { icon: '🗺️', label: 'Sightseeing' },
    travel:      { icon: '🚗',  label: 'Transport' },
    note:        { icon: '🛌',  label: 'Notes' },
  };

  const allBtn = el('button', 'filter-btn active');
  allBtn.dataset.filter = 'all';
  allBtn.textContent = 'All';
  filtersEl.appendChild(allBtn);

  const preferred = ['flight', 'train', 'travel', 'hotel', 'sightseeing'];
  const ordered = preferred.filter(t => types.includes(t)).concat(types.filter(t => !preferred.includes(t)));
  ordered.forEach(type => {
    const info = typeMap[type] || { icon: '•', label: type };
    const btn = el('button', 'filter-btn');
    btn.dataset.filter = type;
    btn.textContent = `${info.icon} ${info.label}`;
    filtersEl.appendChild(btn);
  });

  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filtersEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;
    activitiesEl.querySelectorAll('.activity-card').forEach(card => {
      const t = card.dataset.type;
      card.classList.toggle('hidden', filter !== 'all' && t !== filter);
    });
    activitiesEl.querySelectorAll('.commute-strip').forEach(strip => {
      const isTravelAct = strip.dataset.type === 'travel';
      if (filter === 'all') strip.classList.remove('hidden');
      else if (filter === 'travel' && isTravelAct) strip.classList.remove('hidden');
      else if (filter === 'sightseeing' && !isTravelAct) strip.classList.remove('hidden');
      else strip.classList.add('hidden');
    });
    // also hide day-nav when filtered
    activitiesEl.querySelectorAll('.day-nav').forEach(nav => nav.classList.toggle('hidden', filter !== 'all'));
  });
}

// ── Travel act strip (from explicit travel activities) ────────────────────
function inferMode(act) {
  const src = `${act.id || ''} ${act.note || ''} ${act.from || ''} ${act.to || ''} ${act.title || ''}`.toLowerCase();
  if (/\buber\b|\btaxi\b|\blyft\b/.test(src)) return 'uber';
  if (/\bhoho\b|hop on hop off|hop-on/.test(src)) return 'hoho';
  if (/\bsubway\b|\bmetro\b|\btrain\b|\b7 train\b|\bmta\b/.test(src)) return 'subway';
  if (/\bbus\b|\bcoach\b/.test(src)) return 'bus';
  if (/\bwalk\b|\bshort walk\b|\bwalk to\b/.test(src) || (act.id || '').startsWith('walk_')) return 'walk';
  if (/(sfo|lax|las|buf|jfk|dca|ord|mia|den|sea|ewr|phl|iad)/.test(src)) return 'uber';
  if (act.duration_min && act.duration_min <= 15) return 'walk';
  return 'uber';
}

function buildTravelActStrip(act) {
  // Infer mode if the activity doesn't explicitly provide one.
  const mode = act.mode || inferMode(act);

  const modeIcon  = mode === 'uber'   ? '🚗'
                  : mode === 'walk'   ? '🚶'
                  : mode === 'bus'    ? '🚌'
                  : mode === 'subway' ? '🚇'
                  : mode === 'hoho'   ? '🚌'
                  : mode === 'train'  ? '🚆'
                  : '🚕';

  const modeLabel = mode === 'uber'   ? 'Uber'
                  : mode === 'walk'   ? 'Walk'
                  : mode === 'bus'    ? 'Bus'
                  : mode === 'subway' ? 'Subway'
                  : mode === 'hoho'   ? 'HOHO / Tour Bus'
                  : mode === 'train'  ? 'Train'
                  : (mode || 'Transfer');

  const route  = (act.from && act.to) ? `${act.from} → ${act.to}` : modeLabel;
  const durTxt = act.duration_min ? `~${fmtDuration(act.duration_min)}` : '';

  const strip = el('div', 'commute-strip');
  strip.dataset.type = 'travel';
  strip.innerHTML = `
    <span class="commute-icon">${modeIcon}</span>
    <span class="commute-label">${route}</span>
    <span class="commute-mode">${modeLabel}</span>
    ${durTxt ? `<span class="commute-dur">${durTxt}</span>` : ''}`;
  return strip;
}

// ── Commute strip ──────────────────────────────
function commuteInfo(cityId) {
  const map = {
    sf:   { icon: '🚡', label: 'Cable car / Walk', mode: 'walk' },
    la:   { icon: '🚗', label: 'Drive / Uber', mode: 'uber' },
    lv:   { icon: '🚶', label: 'Walk along the Strip', mode: 'walk' },
    nf:   { icon: '🚶', label: 'Walk', mode: 'walk' },
    dc:   { icon: '🚶', label: 'Walk / Metro', mode: 'subway' },
    ny:   { icon: '🚇', label: 'Subway / Walk', mode: 'subway' },
  };
  return map[cityId] || { icon: '🚕', label: 'Uber', mode: 'uber' };
}

function timeToMins(t) {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function buildCommuteStrip(actA, actB, cityId) {
  const info  = commuteInfo(cityId);
  const strip = el('div', 'commute-strip');
  strip.dataset.type = 'commute';

  const endA   = timeToMins(actA.time) != null ? timeToMins(actA.time) + (actA.duration_min || 0) : null;
  const startB = timeToMins(actB.time);
  const gap    = endA != null && startB != null ? startB - endA : null;
  const travelTxt = (gap != null && gap > 0) ? `~${gap}m travel` : '~15m travel';

  const mode = info.mode || inferMode(actA) || inferMode(actB) || 'uber';
  const modeIcon  = mode === 'uber'   ? '🚗'
                  : mode === 'walk'   ? '🚶'
                  : mode === 'bus'    ? '🚌'
                  : mode === 'subway' ? '🚇'
                  : mode === 'hoho'   ? '🚌'
                  : mode === 'train'  ? '🚆'
                  : '🚕';
  const modeLabel = mode === 'uber'   ? 'Uber'
                  : mode === 'walk'   ? 'Walk'
                  : mode === 'bus'    ? 'Bus'
                  : mode === 'subway' ? 'Subway'
                  : mode === 'hoho'   ? 'HOHO / Tour Bus'
                  : mode === 'train'  ? 'Train'
                  : (mode || 'Transfer');

  strip.innerHTML = `
    <span class="commute-icon">${info.icon}</span>
    <span class="commute-label">${info.label}</span>
    <span class="commute-mode">${modeLabel}</span>
    <span class="commute-dur">${travelTxt}</span>`;
  return strip;
}

// ── Venue icons ────────────────────────────────
function venueIcon(venue, type) {
  const id = (venue.id || '').toLowerCase();
  if (id === 'amnh')                                          return '🦕';
  if (id === 'intrepid')                                     return '⚓';
  if (id === 'statue_of_liberty' || id === 'ellis_island')  return '🗽';
  if (id === 'disneyland')                                   return '🎢';
  if (id === 'high_roller')                                  return '🎡';
  if (id === 'sphere_las_vegas')                             return '🔮';
  if (id === 'bellagio_fountains')                           return '⛲';
  if (id === 'empire_state_building' || id === 'summit' || id === 'top_of_the_rock') return '🏙️';
  if (id === 'griffith_observatory' || id === 'lake_hollywood_park')                  return '🔭';
  if (id === 'brooklyn_bridge' || id === 'dumbo')            return '🌉';
  if (id === 'high_line')                                    return '🌿';
  if (id === 'central_park' || id === 'washington_square_park' || id === 'yosemite_valley' || id === 'el_capitan') return '🌳';
  if (id === 'grand_central_terminal')                       return '🚉';
  if (id === 'times_square' || id === 'fremont_street' || id === 'las_vegas_strip' || id === 'hollywood_walk_of_fame') return '✨';
  if (id === 'dolby_theatre')                                return '🎬';
  if (id === 'powell_cable_car')                             return '🚡';
  if (id === 'pier_39' || id === 'circle_line_cruise')       return '⛴️';
  if (id === 'lombard_street' || id === 'battery_spencer')   return '📸';
  if (id === 'tunnel_view' || id.includes('yosemite') || id === 'bridalveil_fall') return '⛰️';
  if (id === 'white_house' || id === 'capitol_hill')         return '🏛️';
  if (id === 'lincoln_memorial' || id === 'washington_monument') return '🗿';
  if (id === 'niagara_falls')                                return '💧';
  if (id === 'maid_of_the_mist' || id === 'cave_of_the_winds') return '🌊';
  if (id === 'flylinq_zipline' || id === 'vegas_strip_helicopter') return '🪂';
  if (id === 'hudson_yards')                                 return '🏗️';
  if (id === 'wall_street')                                  return '💰';
  if (id === 'friends_building')                             return '🛋️';
  if (id === 'bryant_park')                                  return '🌳';
  return type === 'experience' ? '🎟️' : '📍';
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function weatherIcon()  { return '🌡️'; }
function flightIcon()   { return '✈️'; }
function mapPinSvg() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#e63946"/>
    <circle cx="12" cy="9" r="2.5" fill="#fff"/>
  </svg>`;
}

// ── Modals ────────────────────────────────────
function openImageModal(src, caption) {
  document.getElementById('modalImg').src = src;
  document.getElementById('modalCaption').textContent = caption || '';
  document.getElementById('imageModal').classList.remove('hidden');
}

function openMapModal(venue) {
  const modal = document.getElementById('mapModal');
  if (!modal) return;
  document.getElementById('mapVenueName').textContent = venue.name || '';
  modal.classList.remove('hidden');

  setTimeout(() => {
    if (!leafletMap) {
      leafletMap = L.map('leafletMap').setView([venue.lat, venue.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap);
    } else {
      leafletMap.setView([venue.lat, venue.lng], 15);
    }
    if (leafletMarker) leafletMarker.remove();
    leafletMarker = L.marker([venue.lat, venue.lng])
      .addTo(leafletMap)
      .bindPopup(`<b>${venue.name}</b>`)
      .openPopup();
    leafletMap.invalidateSize();
  }, 80);
}

function initModals() {
  // Image modal
  const imgModal       = document.getElementById('imageModal');
  const imgClose       = document.getElementById('imageModalClose');
  const imgBackdrop    = document.getElementById('imageModalBackdrop');
  if (imgClose)    imgClose.addEventListener('click',    () => { imgModal.classList.add('hidden'); document.getElementById('modalImg').src = ''; });
  if (imgBackdrop) imgBackdrop.addEventListener('click', () => { imgModal.classList.add('hidden'); document.getElementById('modalImg').src = ''; });

  // Map modal
  const mapModal       = document.getElementById('mapModal');
  const mapClose       = document.getElementById('mapModalClose');
  const mapBackdrop    = document.getElementById('mapModalBackdrop');
  if (mapClose)    mapClose.addEventListener('click',    () => mapModal.classList.add('hidden'));
  if (mapBackdrop) mapBackdrop.addEventListener('click', () => mapModal.classList.add('hidden'));

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    imgModal && imgModal.classList.add('hidden');
    mapModal && mapModal.classList.add('hidden');
  });
}

// ── Run ───────────────────────────────────────
boot().catch(err => console.error('Boot failed:', err));
