
/* ──────────────────────────────────────────────
   US Trip — app.js
   All pages share this single script.
   It detects which page is loaded and renders
   accordingly using pure fetch + DOM.
────────────────────────────────────────────── */

const BASE = '../';

let leafletMap = null;
let leafletMarker = null;

// ── Boot ─────────────────────────────────────
async function boot() {
  const [cities, days, activities, venues, hotels] = await Promise.all([
    load('data/cities.json').then(d => d.cities || []),
    load('data/days.json').then(d => d.days || []),
    load('data/activities.json').then(d => d.activities || []),
    load('data/venues.json').then(d => Array.isArray(d) ? d : []),
    load('data/hotels.json').then(d => d.hotels || []),
  ]);

  const data = { cities, days, activities, venues, hotels };

  renderCityNav(cities, days);

  if (document.getElementById('days-list'))   renderIndex(data);
  if (document.getElementById('activities'))  renderDay(data);

  initModals();
}

function load(path) {
  return fetch(BASE + path).then(r => { if (!r.ok) throw new Error(r.url); return r.json(); });
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
    if (firstDay) pill.href = `day.html?id=${firstDay.id}`;
    nav.appendChild(pill);
  });
}

// ── INDEX PAGE ────────────────────────────────
function renderIndex({ cities, days, venues, activities, hotels }) {

  // Days list
  const list = document.getElementById('days-list');
  days.forEach(day => {
    const city = cities.find(c => c.id === day.city);
    const cityName = city ? city.name : (day.city === 'travel' ? 'Travel Day' : day.city || '');
    const card = el('a', 'day-card');
    card.href = `day.html?id=${day.id}`;
    card.innerHTML = `
      <div class="day-card-left">
        <div class="day-badge">${formatShortDate(day.date)}</div>
      </div>
      <div class="day-card-body">
        <div class="day-card-city">${cityName}</div>
        <div class="day-card-title">${day.title}</div>
        <div class="day-card-count muted">${day.activities.length} activities</div>
      </div>
      <div class="day-card-arrow">›</div>`;
    list.appendChild(card);
  });
}

// ── DAY PAGE ──────────────────────────────────
function renderDay({ cities, days, activities, venues, hotels }) {
  const params  = new URLSearchParams(location.search);
  const dayId   = params.get('id');
  const dayIdx  = days.findIndex(d => d.id === dayId);
  const day     = days[dayIdx];
  if (!day) { document.getElementById('dayTitle').textContent = 'Day not found'; return; }

  const prevDay = dayIdx > 0              ? days[dayIdx - 1] : null;
  const nextDay = dayIdx < days.length-1  ? days[dayIdx + 1] : null;

  // City hero
  const city = cities.find(c => c.id === day.city);
  if (city) renderCityHero(city);

  // Day header
  document.title = `${day.title} — US Trip`;
  document.getElementById('dayTitle').textContent = day.title;
  document.getElementById('dayDate').textContent = formatLongDate(day.date);

  // Day navigation (top)
  const container = document.getElementById('activities');
  container.appendChild(buildDayNav(prevDay, nextDay));

  // Activities
  day.activities.forEach(ref => {
    const act = resolveActivity(ref, day.date, activities);
    if (!act) return;
    container.appendChild(buildActivityCard(act, venues, hotels));
  });

  // Day navigation (bottom)
  container.appendChild(buildDayNav(prevDay, nextDay));
}

function renderCityHero(city) {
  const hero   = document.getElementById('cityHero');
  const imgSrc = BASE + city.hero_image;
  hero.className = 'city-hero';
  hero.style.backgroundImage = `url('${imgSrc}')`;
  hero.innerHTML = `
    <div class="city-hero-overlay">
      <div class="city-hero-content">
        <h1 class="city-hero-name">${city.name}</h1>
        <p class="city-hero-why">${city.why_special || ''}</p>
        <div class="city-hero-meta">
          ${weatherIcon()} ${city.weather.expected_temp_day_c}°C day · ${city.weather.expected_temp_evening_c}°C eve
          &nbsp;·&nbsp; ${city.weather.conditions}
        </div>
        <div class="city-hero-clothing">
          👕 ${city.clothing.day} &nbsp;·&nbsp; 🧥 ${city.clothing.evening}
        </div>
        <button class="hero-zoom-btn" aria-label="View full image">🔍 View photo</button>
      </div>
    </div>`;
  hero.querySelector('.hero-zoom-btn').addEventListener('click', () => openImageModal(imgSrc, city.name));
}

// ── Activity card builder ─────────────────────
function buildActivityCard(act, venues, hotels) {
  const card = el('div', 'activity-card');

  if (act.type === 'flight') {
    card.classList.add('card-flight');
    card.innerHTML = `
      <div class="ac-icon">${flightIcon()}</div>
      <div class="ac-body">
        <div class="ac-title">${act.from} → ${act.to}</div>
        <div class="ac-sub">${act.airline || ''} ${act.flight_number ? '· ' + act.flight_number : ''}</div>
        <div class="ac-sub">${act.category === 'international' ? '🌍 International' : '✈️ Domestic'} · Departs ${act.time || ''}</div>
      </div>`;
    return card;
  }

  if (act.type === 'train') {
    card.classList.add('card-train');
    card.innerHTML = `
      <div class="ac-icon">🚆</div>
      <div class="ac-body">
        <div class="ac-title">${act.from} → ${act.to}</div>
        <div class="ac-sub">${act.operator || ''} · Departs ${act.time || ''}</div>
      </div>`;
    return card;
  }

  if (act.type === 'hotel') {
    const hotel = findHotel(act.hotel, hotels);
    card.classList.add('card-hotel');
    let inner = `
      <div class="ac-icon">🏨</div>
      <div class="ac-body">
        <div class="ac-title">${act.hotel}</div>`;
    if (hotel) {
      if (hotel.location || hotel.address) {
        inner += `<div class="ac-sub">📍 ${[hotel.location, hotel.address].filter(Boolean).join(', ')}</div>`;
      }
      inner += `<div class="ac-sub">Check-in: ${act.time || hotel.check_in || ''} &nbsp;·&nbsp; Check-out: ${hotel.check_out || ''}</div>`;
      if (hotel.description) {
        inner += `<div class="ac-desc">${hotel.description}</div>`;
      }
    } else {
      inner += `<div class="ac-sub">Check-in: ${act.time || ''}</div>`;
    }
    inner += `</div>`;
    card.innerHTML = inner;
    return card;
  }

  if (act.type === 'visit' || act.type === 'experience') {
    const venue = venues.find(v => v.id === act.venue_id) || { name: act.venue_id, lat: null, lng: null };
    card.classList.add(act.type === 'experience' ? 'card-experience' : 'card-visit');

    const left = el('div', 'ac-body');
    left.innerHTML = `
      <div class="ac-title">${venue.name || act.venue_id}</div>
      <div class="ac-sub">${act.time || ''}</div>
      ${venue.description ? `<div class="ac-desc">${venue.description}</div>` : ''}
      ${venue.tip ? `<div class="ac-tip">💡 ${venue.tip}</div>` : ''}`;

    const right = el('div', 'ac-right');
    if (act.duration_min) {
      const durSpan = el('span', 'ac-duration');
      durSpan.textContent = fmtDuration(act.duration_min);
      right.appendChild(durSpan);
    }
    if (venue.lat != null && venue.lng != null) {
      const mapBtn = el('button', 'map-btn');
      mapBtn.setAttribute('aria-label', `Map: ${venue.name}`);
      mapBtn.innerHTML = mapPinSvg();
      mapBtn.addEventListener('click', () => openMapModal(venue));
      right.appendChild(mapBtn);
    }

    const icon = el('div', 'ac-icon');
    icon.textContent = act.type === 'experience' ? '🎟️' : '📍';

    card.appendChild(icon);
    card.appendChild(left);
    card.appendChild(right);
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

function findHotel(name, hotels) {
  if (!name) return null;
  const n = name.toLowerCase();
  return hotels.find(h => h.name && h.name.toLowerCase().includes(n)) || null;
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
  const prevLink = el('a', 'day-nav-btn day-nav-prev');
  const nextLink = el('a', 'day-nav-btn day-nav-next');
  if (prevDay) {
    prevLink.href = `day.html?id=${prevDay.id}`;
    prevLink.innerHTML = `‹ <span>${prevDay.title}</span>`;
  } else {
    prevLink.classList.add('disabled');
    prevLink.innerHTML = `‹ <span>First day</span>`;
  }
  if (nextDay) {
    nextLink.href = `day.html?id=${nextDay.id}`;
    nextLink.innerHTML = `<span>${nextDay.title}</span> ›`;
  } else {
    nextLink.classList.add('disabled');
    nextLink.innerHTML = `<span>Last day</span> ›`;
  }
  nav.appendChild(prevLink);
  nav.appendChild(nextLink);
  return nav;
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
