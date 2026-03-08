
/* ──────────────────────────────────────────────
   US Trip — app.js
   All pages share this single script.
   It detects which page is loaded and renders
   accordingly using pure fetch + DOM.
────────────────────────────────────────────── */

const isIndex  = !!document.getElementById('overview-grid');
const BASE     = isIndex ? '' : '../';
const DAY_PATH = isIndex ? 'pages/day.html' : 'day.html';
const HOME_URL = isIndex ? '#'              : '../index.html';

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

  if (document.getElementById('overview-grid')) renderIndex(data);
  if (document.getElementById('activities'))   renderDay(data);

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
function renderIndex({ cities, days, venues, activities, hotels }) {
  renderOverview({ cities, days });
}

// ── OVERVIEW GRID (city-grouped tiles) ─────────────────────────
function renderOverview({ cities, days }) {
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
      const dayImg  = `${BASE}images/days/${day.id}/hero.jpg`;
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
function renderDay({ cities, days, activities, venues, hotels }) {
  const params  = new URLSearchParams(location.search);
  const dayId   = params.get('id');
  const dayIdx  = days.findIndex(d => d.id === dayId);
  const day     = days[dayIdx];
  if (!day) { document.getElementById('dayTitle').textContent = 'Day not found'; return; }

  const prevDay = dayIdx > 0              ? days[dayIdx - 1] : null;
  const nextDay = dayIdx < days.length-1  ? days[dayIdx + 1] : null;

  // Day hero (per-day image, city data for overlay text)
  const city = cities.find(c => c.id === day.city);
  renderDayHero(city, day);

  // Day header
  document.title = `${day.title} — US Trip`;
  document.getElementById('dayTitle').textContent = day.title;
  document.getElementById('dayDate').textContent = formatLongDate(day.date);

  // Day navigation (top)
  const container = document.getElementById('activities');
  container.appendChild(buildDayNav(prevDay, nextDay));

  // Resolve all activities (filter nulls)
  const resolved = day.activities
    .map(ref => resolveActivity(ref, day.date, activities))
    .filter(Boolean);

  // Filter buttons
  const filtersDiv = document.getElementById('activityFilters');
  const typeSet = new Set(resolved.map(a => filterType(a)));
  if (filtersDiv && typeSet.size > 1) {
    buildFilterButtons([...typeSet], filtersDiv, container);
  }

  // Activities + commute strips
  resolved.forEach((act, i) => {
    const card = buildActivityCard(act, venues, hotels);
    container.appendChild(card);
    const next = resolved[i + 1];
    if (next && isVenueAct(act) && isVenueAct(next)) {
      container.appendChild(buildCommuteStrip(act, next, day.city));
    }
  });

  // Day navigation (bottom)
  container.appendChild(buildDayNav(prevDay, nextDay));
}

function renderDayHero(city, day) {
  const hero     = document.getElementById('cityHero');
  const dayImgSrc = `${BASE}images/days/${day.id}/hero.jpg`;
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

  hero.innerHTML = `
    <div class="city-hero-overlay">
      <div class="city-hero-content">
        <h1 class="city-hero-name">${name}</h1>
        ${why ? `<p class="city-hero-why">${why}</p>` : ''}
        ${meta ? `<div class="city-hero-meta">${meta}</div>` : ''}
        ${clothing ? `<div class="city-hero-clothing">${clothing}</div>` : ''}
        <button class="hero-zoom-btn" aria-label="View full image">🔍 View photo</button>
      </div>
    </div>`;
  hero.querySelector('.hero-zoom-btn').addEventListener('click', () => openImageModal(dayImgSrc, day.title));
}

// ── Activity card builder ─────────────────────
function buildActivityCard(act, venues, hotels) {
  const card = el('div', 'activity-card');
  card.dataset.type = filterType(act);

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
    if (venue.image_folder) card.classList.add('card-has-photo');

    const left = el('div', 'ac-body');
    left.innerHTML = `
      <div class="ac-title">${venue.name || act.venue_id}</div>
      <div class="ac-sub">${act.time || ''}</div>
      ${venue.description ? `<div class="ac-desc">${venue.description}</div>` : ''}
      ${venue.tip ? `<div class="ac-tip">💡 ${venue.tip}</div>` : ''}`;

    const right = el('div', 'ac-right');

    // Venue photo thumbnail
    if (venue.image_folder) {
      const imgSrc = `${BASE}images/venues/${venue.image_folder}/hero.jpg`;
      const thumb  = el('div', 'venue-thumb');
      thumb.style.backgroundImage = `url('${imgSrc}')`;
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `View photo: ${venue.name}`);
      thumb.addEventListener('click', () => openImageModal(imgSrc, venue.name));
      right.appendChild(thumb);
    }

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
    icon.textContent = venueIcon(venue, act.type);

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
  nav.appendChild(prevLink);
  nav.appendChild(nextLink);
  return nav;
}

// ── Filter helpers ─────────────────────────────
function filterType(act) {
  if (act.type === 'visit' || act.type === 'experience') return 'sightseeing';
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
  };

  const allBtn = el('button', 'filter-btn active');
  allBtn.dataset.filter = 'all';
  allBtn.textContent = 'All';
  filtersEl.appendChild(allBtn);

  const preferred = ['flight', 'train', 'hotel', 'sightseeing'];
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
      strip.classList.toggle('hidden', filter !== 'all' && filter !== 'sightseeing');
    });
    // also hide day-nav when filtered
    activitiesEl.querySelectorAll('.day-nav').forEach(nav => nav.classList.toggle('hidden', filter !== 'all'));
  });
}

// ── Commute strip ──────────────────────────────
function commuteInfo(cityId) {
  const map = {
    sf:   { icon: '🚡', label: 'Cable car / Walk' },
    la:   { icon: '🚗', label: 'Drive / Uber' },
    lv:   { icon: '🚶', label: 'Walk along the Strip' },
    nf:   { icon: '🚶', label: 'Walk' },
    dc:   { icon: '🚶', label: 'Walk / Metro' },
    ny:   { icon: '🚇', label: 'Subway / Walk' },
  };
  return map[cityId] || { icon: '🚕', label: 'Uber' };
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

  strip.innerHTML = `
    <span class="commute-icon">${info.icon}</span>
    <span class="commute-label">${info.label}</span>
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
