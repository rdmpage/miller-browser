// miller-browser: a trail of Miller columns over a SPARQL endpoint.
//
// The trail is a list of steps, mirrored in the URL hash:
//   c=<iri>            card for an entity
//   l=<dir> <p> [<t>]  list of entities linked to the preceding card
//   t=<type>           list of instances of a type
//   val=[p, term]      list of entities sharing a date value
//   q=<text>           exact-label search
//   view=map           show the preceding list as a map
// Column 0 is the start column and is not part of the trail.

import { SparqlClient } from './sparql.js';
import { Lens, localName, imageFor, RDF_TYPE } from './lens.js';
import { Queries } from './queries.js';
import { drawMap } from './map.js';

const $ = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
};

// Literals with these datatypes open a list of everything sharing the value.
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const DATE_TYPES = new Set(['date', 'dateTime', 'gYear', 'gYearMonth'].map((t) => XSD + t));

// Lists this small get a narrower column.
const SHORT_LIST = 3;

const fmt = (n, capped) => (capped ? `${n.toLocaleString()}+` : n.toLocaleString());

const state = { config: null, endpoint: null, q: null, trail: [], columns: [] };
const columnsEl = document.getElementById('columns');
const pickerEl = document.getElementById('endpoint');

// ---------- URL <-> trail ----------

// Identity of a step, ignoring how a list is viewed (list or map).
function stepKey(s) {
  return JSON.stringify({ ...s, view: undefined });
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const trail = [];
  for (const [k, v] of params) {
    if (k === 'c') trail.push({ k: 'card', iri: v });
    else if (k === 'l') {
      const [dir, p, t = ''] = v.split(' ');
      trail.push({ k: 'links', dir, p, t });
    } else if (k === 't') trail.push({ k: 'type', t: v });
    else if (k === 'val') {
      try {
        const [p, o] = JSON.parse(v);
        trail.push({ k: 'value', p, o });
      } catch { /* ignore malformed step */ }
    } else if (k === 'q') trail.push({ k: 'search', q: v });
    else if (k === 'view' && trail.length) trail[trail.length - 1].view = v;
  }
  return { ep: params.get('ep'), trail };
}

function writeHash() {
  const params = new URLSearchParams({ ep: state.endpoint.id });
  for (const s of state.trail) {
    if (s.k === 'card') params.append('c', s.iri);
    else if (s.k === 'links') params.append('l', [s.dir, s.p, s.t].filter(Boolean).join(' '));
    else if (s.k === 'type') params.append('t', s.t);
    else if (s.k === 'value') params.append('val', JSON.stringify([s.p, s.o]));
    else if (s.k === 'search') params.append('q', s.q);
    if (s.view) params.append('view', s.view);
  }
  const hash = '#' + params.toString();
  if (location.hash !== hash) history.pushState(null, '', hash);
}

// Replace everything after column `index` (0 = start column) with `steps`.
function go(index, steps) {
  state.trail = state.trail.slice(0, index).concat(steps);
  writeHash();
  render();
}

// ---------- endpoint setup ----------

async function useEndpoint(id) {
  const ep = state.config.endpoints.find((e) => e.id === id) || state.config.endpoints[0];
  if (state.endpoint?.id === ep.id) return;
  const cfg = { ...state.config.defaults, ...ep };
  let lensJson = {};
  if (ep.lens) {
    try {
      lensJson = await (await fetch(ep.lens)).json();
    } catch (err) {
      console.warn(`Could not load lens ${ep.lens}`, err);
    }
  }
  const lens = new Lens(lensJson, cfg);
  const client = new SparqlClient(ep.url, cfg);
  state.endpoint = ep;
  state.q = new Queries(client, lens, cfg);
  state.lens = lens;
  state.cfg = cfg;
  pickerEl.value = ep.id;
  for (const c of state.columns) c.el.remove();
  state.columns = [];
}

// ---------- rendering ----------

// Rebuild columns, keeping those whose step (and everything before) is unchanged.
function render() {
  const wanted = [{ k: 'start' }, ...state.trail];
  let keep = 0;
  while (
    keep < state.columns.length &&
    keep < wanted.length &&
    state.columns[keep].key === stepKey(wanted[keep])
  ) keep++;
  for (const c of state.columns.splice(keep)) c.el.remove();
  // Kept columns may still need to follow a change of view (e.g. Back).
  state.columns.forEach((c, i) => c.el.syncStep?.(wanted[i]));

  for (let i = keep; i < wanted.length; i++) {
    const el = buildColumn(wanted[i], i);
    columnsEl.append(el);
    state.columns.push({ key: stepKey(wanted[i]), el });
  }
  // Highlight the item in each column that leads to the next.
  state.columns.forEach((c, i) => {
    markActive(c.el, wanted[i + 1]);
    c.el.onActive?.(wanted[i + 1]);
  });
  state.followEnd = true;
  scrollToEnd();
  document.title = `${state.endpoint.name} · miller-browser`;
}

// Bring the newest column into view once layout has settled. Until the user
// scrolls or clicks, columns that resize as their counts arrive re-trigger
// this (state.followEnd).
function scrollToEnd() {
  // Hidden tabs neither run animation frames nor animate scrolling.
  if (document.hidden) columnsEl.scrollTo({ left: columnsEl.scrollWidth });
  else requestAnimationFrame(() => columnsEl.scrollTo({ left: columnsEl.scrollWidth, behavior: 'smooth' }));
}

function markActive(colEl, next) {
  const key = next ? stepKey(next) : null;
  for (const el of colEl.querySelectorAll('[data-step]')) {
    const on = el.dataset.step === key;
    el.classList.toggle('active', on);
    if (on && el.classList.contains('item')) revealVertically(el);
  }
}

// Scroll an item's column (not the page, not sideways) so the item is visible.
function revealVertically(el) {
  const body = el.closest('.col-body');
  if (!body) return;
  const top = el.offsetTop - body.offsetTop;
  if (top < body.scrollTop || top + el.offsetHeight > body.scrollTop + body.clientHeight) {
    body.scrollTop = top - body.clientHeight / 3;
  }
}

// A list-like column: a bordered panel with a heading and scrolling body.
function column(kind, heading, sub) {
  const body = $('div', { class: 'col-body' });
  const el = $('section', { class: `column ${kind}` },
    $('header', { class: 'col-head' },
      $('div', { class: 'col-kind' }, sub || ''),
      $('h2', {}, heading)),
    body);
  return { el, body, head: el.querySelector('h2'), kindEl: el.querySelector('.col-kind') };
}

const badge = (text) => $('span', { class: 'badge' }, text);

function status(text, cls = 'loading') {
  return $('div', { class: `status ${cls}` }, text);
}

function errorBox(err) {
  return status(err.message || String(err), 'error');
}

// A clickable item: `kind` is 'item' (an entity card in a list) or 'link'
// (an aggregated link on a card). `step` is what it opens, for highlighting.
function row(kind, index, step, main, { sub, count } = {}) {
  return $('button', {
    class: kind,
    type: 'button',
    'data-step': stepKey(step),
    onclick: () => go(index, [step]),
  },
  $('span', { class: 'row-text' },
    $('span', { class: 'row-main' }, main),
    sub ? $('span', { class: 'row-sub' }, sub) : null),
  count != null ? badge(count) : null);
}

// Fill in an item's label and subtitle once they arrive.
function labelItem(r, label, sub) {
  r.querySelector('.row-main').textContent = label;
  if (sub) r.querySelector('.row-text').append($('span', { class: 'row-sub' }, sub));
}

function buildColumn(step, index) {
  switch (step.k) {
    case 'start': return startColumn();
    case 'card': return cardColumn(step, index);
    default: return listColumn(step, index);
  }
}

// ---------- start column ----------

function startColumn() {
  const { el, body } = column('start', state.endpoint.name, 'Start');
  const input = $('input', { type: 'search', placeholder: 'Exact name or IRI…', 'aria-label': 'Search' });
  const form = $('form', {
    class: 'search',
    onsubmit: (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      go(0, [/^https?:\/\//.test(text) ? { k: 'card', iri: text } : { k: 'search', q: text }]);
    },
  }, input);
  body.append(form);

  const starts = state.endpoint.start || [];
  if (starts.length) {
    const box = $('div', { class: 'group' }, $('h3', {}, 'Start here'));
    const rows = starts.map((s) => {
      const r = row('item', 0, { k: 'card', iri: s }, localName(s));
      box.append(r);
      return [s, r];
    });
    body.append(box);
    state.q.brief(starts).then((b) => {
      for (const [s, r] of rows) {
        const info = b.get(s);
        if (!info) continue;
        labelItem(r, info.label, info.types.map(localName).join(', '));
      }
    }).catch(() => {});
  }

  const typesBox = $('div', { class: 'group' }, $('h3', {}, 'Types'), status('Finding types…'));
  body.append(typesBox);
  const typesP = state.cfg.types ? Promise.resolve(state.cfg.types.map((t) => state.lens.expand(t))) : state.q.types();
  typesP.then((types) => {
    typesBox.querySelector('.status').remove();
    for (const t of types) {
      const r = row('item', 0, { k: 'type', t }, localName(t), { sub: t, count: '…' });
      typesBox.append(r);
      state.q.count(state.q.typePattern(t))
        .then(({ n, capped }) => { r.querySelector('.badge').textContent = fmt(n, capped); })
        .catch(() => { r.querySelector('.badge').textContent = '?'; });
    }
  }).catch((err) => typesBox.querySelector('.status').replaceWith(errorBox(err)));
  return el;
}

// ---------- card column ----------

// A card column is borderless and holds a single card: title, fields, and
// the entity's aggregated links along the bottom.
function cardColumn(step, index) {
  const kindEl = $('div', { class: 'col-kind' });
  const head = $('h2', {}, localName(step.iri));
  const idLine = $('a', { class: 'iri', href: step.iri, target: '_blank', rel: 'noopener' }, step.iri);
  const fieldsBox = $('div', { class: 'fields' }, status('Loading…'));
  const linksBox = $('div', { class: 'links' });
  const cardEl = $('article', { class: 'entity' }, kindEl, head, idLine, fieldsBox, linksBox);
  const el = $('section', { class: 'column card-col' }, $('div', { class: 'col-body' }, cardEl));

  const cardP = state.q.card(step.iri);
  const outP = state.q.linkGroups(step.iri, 'out');
  const inP = state.q.linkGroups(step.iri, 'in');

  cardP.then(async (card) => {
    head.textContent = card.label;
    kindEl.replaceChildren(...card.types.map((t) =>
      $('a', { class: 'type-chip', href: '#', onclick: (e) => { e.preventDefault(); go(index, [{ k: 'type', t }]); } }, localName(t))));
    const img = imageFor(step.iri, card.types, state.lens);
    if (img) cardEl.insertBefore($('img', { class: 'thumb', src: img, alt: '' }), fieldsBox);

    // Outgoing links to untyped resources are shown inline as fields; typed
    // ones become link groups. Wait for the out-groups to know which is which.
    let typedOut = new Set();
    try {
      const { groups } = await outP;
      typedOut = new Set(groups.filter((g) => g.t).map((g) => g.p));
    } catch { /* show everything inline */ }
    await state.q.predicateLabels([...card.props.keys()]).catch(() => {});
    fieldsBox.replaceChildren(...renderFields(card, typedOut, index));
    if (card.truncated) fieldsBox.append(status('Showing the first 500 values.', 'note'));
  }).catch((err) => fieldsBox.replaceChildren(errorBox(err)));

  renderLinks(linksBox, step, index, outP, inP);
  return el;
}

function renderFields(card, typedOut, index) {
  const lens = state.lens;
  const summary = lens.forTypes(card.types)?.summary || [];
  const name = (p) => state.q.predName(p);
  const preds = [...card.props.keys()]
    .filter((p) => p !== RDF_TYPE && !lens.hiddenPredicates.has(p) && !typedOut.has(p))
    .sort((a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b)));
  function rank(p) {
    const i = summary.indexOf(p);
    if (i >= 0) return i;
    return lens.labelProperties.includes(p) ? -1 : 100;
  }
  if (!preds.length && !card.computed.length) return [status('No literal values.', 'note')];

  const dl = $('dl', {});
  for (const f of card.computed) {
    dl.append($('dt', {}, f.label), $('dd', {}, ...f.values.map((o) => valueEl(null, o, index))));
  }
  for (const p of preds) {
    const vals = card.props.get(p);
    const dd = $('dd', {});
    const show = 6;
    vals.slice(0, show).forEach((o) => dd.append(valueEl(p, o, index)));
    if (vals.length > show) {
      const more = $('button', { class: 'more', type: 'button' }, `+${vals.length - show} more`);
      more.onclick = () => { more.remove(); vals.slice(show).forEach((o) => dd.append(valueEl(p, o, index))); };
      dd.append(more);
    }
    dl.append($('dt', { title: p }, name(p)), dd);
  }
  return [dl];
}

// Literals are plain text, except typed dates, which list everything else
// with that date (`p` is null for lens path fields, which cannot pivot). An
// IRI (a link to a resource with no type, such as sameAs) opens its card.
// How to mark internal vs external links is still an open question.
function valueEl(p, o, index) {
  if (o.type === 'uri') {
    const step = { k: 'card', iri: o.value };
    return $('button', { class: 'val val-link', type: 'button', 'data-step': stepKey(step), onclick: () => go(index, [step]) }, shortIri(o.value));
  }
  if (p && DATE_TYPES.has(o.datatype)) {
    const step = { k: 'value', p, o };
    return $('button', {
      class: 'val val-link', type: 'button', 'data-step': stepKey(step),
      title: 'Everything with this date',
      onclick: () => go(index, [step]),
    }, o.value);
  }
  return $('span', { class: 'val' }, o.value, o['xml:lang'] ? $('sup', {}, o['xml:lang']) : null);
}

function shortIri(s) {
  return s.replace(/^https?:\/\/(www\.)?/, '');
}

function groupLabel(g) {
  const lensLabel = state.lens.edgeLabel(g.dir, g.p, g.t);
  const pName = state.q.predName(g.p);
  const arrow = g.dir === 'out' ? `${pName} →` : `← ${pName}`;
  const typeName = g.t ? localName(g.t) : 'untyped';
  if (lensLabel) return { main: lensLabel, sub: `${arrow} ${typeName}` };
  return g.dir === 'out'
    ? { main: pName, sub: `→ ${typeName}` }
    : { main: typeName, sub: arrow };
}

function renderLinks(box, step, index, outP, inP) {
  const loading = status('Finding links…');
  box.append(loading);
  // Outgoing, then incoming.
  const parts = [$('div', { class: 'group' }), $('div', { class: 'group' })];
  box.append(...parts);
  let pending = 2;
  const done = () => {
    if (--pending > 0) return;
    loading.remove();
    if (!parts.some((p) => p.children.length)) box.append(status('No links.', 'note'));
  };

  [outP, inP].forEach((p, i) => {
    const list = parts[i];
    p.then(async ({ groups, saturated }) => {
      await state.q.predicateLabels(groups.map((g) => g.p)).catch(() => {});
      if (saturated) {
        list.append(status(`Links sampled from the first ${state.cfg.sampleLimit.toLocaleString()}; rarer kinds may be missing.`, 'note'));
      }
      for (const g of groups) {
        if (g.dir === 'out' && !g.t) continue; // shown inline on the card
        const { main, sub } = groupLabel(g);
        const listStep = { k: 'links', dir: g.dir, p: g.p, t: g.t };
        // Every link group opens a list, even of one: each column is a hop
        // along an edge in the graph.
        const r = row('link', index, listStep, main, { sub, count: saturated ? '…' : fmt(g.n) });
        if (saturated) {
          state.q.count(state.q.linkPattern(step.iri, g.dir, g.p, g.t))
            .then(({ n, capped }) => { r.querySelector('.badge').textContent = fmt(n, capped); })
            .catch(() => { r.querySelector('.badge').textContent = `${fmt(g.n)}+`; });
        }
        list.append(r);
      }
      done();
      markActive(box, state.trail[index]);
    }).catch((err) => { list.append(errorBox(err)); done(); });
  });
}

// ---------- list column ----------

// The card step immediately before list step `index` (trail is 1-based in columns).
function parentCard(index) {
  const prev = state.trail[index - 2];
  return prev?.k === 'card' ? prev.iri : null;
}

function listSpec(step, index) {
  const q = state.q;
  switch (step.k) {
    case 'links': {
      const s = parentCard(index);
      if (!s) return null;
      const g = { dir: step.dir, p: step.p, t: step.t };
      const { main, sub } = groupLabel(g);
      return { pattern: q.linkPattern(s, step.dir, step.p, step.t), t: step.t, title: main, kind: sub };
    }
    case 'type':
      return { pattern: q.typePattern(step.t), t: step.t, title: localName(step.t), kind: 'Instances of' };
    case 'value':
      return { pattern: q.valuePattern(step.p, step.o), t: null, title: step.o.value, kind: `${q.predName(step.p)} =` };
    case 'search':
      return { pattern: q.searchPattern(step.q), t: null, title: `“${step.q}”`, kind: 'Named' };
  }
  return null;
}

function listColumn(initialStep, index) {
  let step = initialStep;
  const spec = listSpec(step, index);
  if (!spec) {
    const { el, body } = column('list', 'Unknown step');
    body.append(status('This step needs a card before it.', 'error'));
    return el;
  }
  const { el, body, kindEl } = column('list', spec.title, spec.kind);
  const countEl = badge('…');
  kindEl.append(' ', countEl);
  const items = $('div', { class: 'group' });
  const foot = $('div', { class: 'foot' }, status('Loading…'));
  body.append(items, foot);

  let offset = 0;
  let sorted = false;

  // List | Map switch, shown once the first page turns out to have points.
  let geoKind = null;
  let mapBox = null;
  let mapApi = null;
  let activeIri = null;
  const viewBtn = (v, label) => $('button', { type: 'button', 'data-view': v, onclick: () => setView(v, true) }, label);
  const viewsEl = $('div', { class: 'views', hidden: true }, viewBtn('list', 'List'), viewBtn('map', 'Map'));
  el.querySelector('.col-head').append(viewsEl);

  function setView(v, record) {
    const map = v === 'map' && geoKind;
    step.view = map ? 'map' : undefined;
    if (record) writeHash();
    el.classList.toggle('map-view', !!map);
    for (const b of viewsEl.children) b.classList.toggle('on', b.dataset.view === (map ? 'map' : 'list'));
    items.hidden = foot.hidden = !!map;
    if (mapBox) mapBox.hidden = !map;
    if (map) showMap();
    if (state.followEnd || record) scrollToEnd();
  }

  function showMap() {
    if (mapBox) {
      mapApi?.resize();
      return;
    }
    const note = status('Finding points…');
    mapBox = $('div', { class: 'map-box' });
    body.append($('div', { class: 'map-wrap' }, note, mapBox));
    Promise.all([state.q.geoPoints(spec.pattern, geoKind), state.q.geoCount(spec.pattern, geoKind)])
      .then(async ([points, { n, capped }]) => {
        const shown = points.length < n || capped ? `first ${points.length.toLocaleString()} of ${fmt(n, capped)}` : fmt(n);
        note.className = 'status note';
        note.textContent = `Showing ${shown} with coordinates`;
        mapApi = await drawMap(mapBox, points, {
          onPick: (x) => go(index, [{ k: 'card', iri: x }]),
          labelFor: async (x) => (await state.q.brief([x])).get(x)?.label || localName(x),
        });
        mapApi.highlight(activeIri);
      })
      .catch((err) => note.replaceWith(errorBox(err)));
  }

  el.onActive = (next) => {
    activeIri = next?.k === 'card' ? next.iri : null;
    mapApi?.highlight(activeIri);
  };
  el.syncStep = (s) => {
    step = s;
    if (geoKind) setView(s.view, false);
  };

  const loadPage = () => {
    foot.replaceChildren(status('Loading…'));
    state.q.page(spec.pattern, { t: spec.t, offset, sorted })
      .then(async ({ items: xs, more }) => {
        offset += xs.length;
        const rows = xs.map((x) => {
          const r = row('item', index, { k: 'card', iri: x }, localName(x));
          items.append(r);
          return [x, r];
        });
        if (offset === xs.length && xs.length) {
          // First page: do any members have coordinates?
          state.q.geoProbe(xs).then((kind) => {
            if (!kind) return;
            geoKind = kind;
            viewsEl.hidden = false;
            setView(step.view, false);
          }).catch(() => {});
        }
        markActive(el, state.trail[index]);
        foot.replaceChildren();
        if (!xs.length && offset === 0) foot.append(status('Nothing here.', 'note'));
        if (more) foot.append($('button', { class: 'more', type: 'button', onclick: loadPage }, 'Load more'));
        try {
          const b = await state.q.brief(xs);
          for (const [x, r] of rows) {
            const info = b.get(x);
            if (!info) continue;
            labelItem(r, info.label, info.summary || info.types.map(localName).join(', '));
          }
        } catch { /* keep IRI tails as labels */ }
      })
      .catch((err) => foot.replaceChildren(errorBox(err)));
  };

  // Count first (capped) so we know whether sorting is affordable; the page
  // query does not wait longer than it has to.
  state.q.count(spec.pattern)
    .then(({ n, capped }) => {
      countEl.textContent = fmt(n, capped);
      el.classList.toggle('short', !capped && n <= SHORT_LIST);
      if (state.followEnd) scrollToEnd(); // narrowing shifts the columns
      sorted = !capped && n <= state.cfg.sortLimit;
      if (!sorted) kindEl.append($('span', { class: 'note', title: 'Too many to sort cheaply' }, ' · unsorted'));
    })
    .catch(() => { countEl.textContent = '?'; })
    .finally(loadPage);
  return el;
}

// ---------- boot ----------

async function boot() {
  state.config = await (await fetch('config/endpoints.json')).json();
  for (const ep of state.config.endpoints) pickerEl.append($('option', { value: ep.id }, ep.name));
  pickerEl.addEventListener('change', async () => {
    await useEndpoint(pickerEl.value);
    state.trail = [];
    writeHash();
    render();
  });
  const fromHash = async () => {
    const { ep, trail } = readHash();
    await useEndpoint(ep);
    state.trail = trail;
    render();
  };
  window.addEventListener('popstate', fromHash);
  for (const ev of ['wheel', 'pointerdown', 'keydown', 'touchstart']) {
    columnsEl.addEventListener(ev, () => { state.followEnd = false; }, { passive: true });
  }
  await fromHash();
}

boot().catch((err) => {
  columnsEl.append(status(`Could not start: ${err.message}`, 'error'));
});
