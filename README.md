# miller-browser

Browse a SPARQL knowledge graph as a trail of Miller columns, without
confronting the user with a node-link diagram.

Vanilla HTML, CSS and JavaScript. No framework, no build step.

## Running

Serve the folder statically and open it in a browser:

```
php -S localhost:8000
```

`index.html` is a demo host: an endpoint picker over `config/endpoints.json`
(each endpoint with an optional lens in `lenses/*.json` and some start
entities) and one browser below it. The trail lives in the URL hash, so any
view can be bookmarked or shared. `embed.html` shows the browser inside
another page.

## Embedding

The browser is a plain ES module with no dependencies (Leaflet is loaded
only when a map is first shown). Copy `js/`, `css/miller.css` and any lenses
you want, or load them from a pinned release, e.g.
`https://cdn.jsdelivr.net/gh/rdmpage/miller-browser@v0.1.0/js/browser.js`.

```html
<link rel="stylesheet" href="css/miller.css">
<div id="browser" style="height: 80vh"></div>
<script type="module">
  import { mount } from './js/browser.js';

  const browser = mount(document.getElementById('browser'), {
    endpoint: 'https://example.org/dataset/sparql',
  });
</script>
```

`mount(element, options)` takes over `element` (give it a height) and returns
`{ ready, trail, setTrail(string), destroy() }`. Options:

| Option | Default | Meaning |
|---|---|---|
| `endpoint` | required | A SPARQL endpoint URL, or an object `{ url, name, start, types, ... }`. `name` heads the start column; `start` is a list of IRIs offered as starting points; `types` skips the "types in use" query. Any setting in `js/defaults.js` (label properties, hidden plumbing, limits, timeouts, geo properties) can be overridden here. The default label properties include SKOS-XL (`skosxl:prefLabel/skosxl:literalForm`), so datasets like the Crossref Funder Registry show names with no lens. Default `imageTypes` show `foaf:Image` and `schema:ImageObject` entities as pictures (an ImageObject's `schema:contentUrl` or `schema:url`, else the IRI) on their cards and as thumbnails in lists; a lens `image` template for the type overrides this, and `"image": false` turns it off. |
| `lens` | none | A lens object, or the URL of a lens JSON file (see `lenses/`). Optional: without one the browser runs generically. |
| `urlState` | `'hash'` | Where the trail is kept: `'hash'`, `'search'` (query string), or `'none'` (in memory only). Parameters that aren't part of the trail are left alone. |
| `urlParam` | none | Pack the trail into this one parameter (e.g. `'trail'`) instead of flat `c=`, `l=`, `t=`, `val=`, `q=`, `view=` parameters, which might clash with the host's. |
| `trail` | none | A trail string to start from when the URL holds none (see `js/trail.js`). |
| `onTrailChange` | none | Called with the trail string whenever it changes, e.g. for the host's own routing or page title. |
| `theme` | follows the system | `'light'` or `'dark'` to force a theme. |
| `tiles` | OpenStreetMap | Map tiles: `{ url, attribution, maxZoom }`, e.g. `{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }`. Any other keys (e.g. `subdomains`) are passed to Leaflet's `L.tileLayer`. OSM's public tile server is fine for light use; a busy site should use its own provider. |
| `leaflet` | cdnjs 1.9.4 | URL prefix serving `leaflet.min.js` and `leaflet.min.css`, if the host serves Leaflet itself. If the page already has `window.L`, that is used. |

Styling is scoped: every rule in `css/miller.css` is under `.miller` (added to
the mounted element), and colours and column widths are custom properties on
`.miller` (`--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--accent`,
`--selected`, `--col-w`, `--card-w`, ...), so a host can restyle it by
overriding them, e.g. `#browser.miller { --accent: #0a7; }`. Narrow layouts
respond to the browser's own width, not the window's.

The endpoint must allow cross-origin requests from the host page, unless it
is on the same origin. Several browsers can be mounted on one page, but only
one should keep its trail in the URL (give the others `urlState: 'none'`).

## The idea

- A **card** column shows one entity: its title and a few core fields. Down its
  right margin are **aggregated links** to other entities ("12 Parts",
  "340 Pages").
- Clicking an aggregation opens a **list** column holding the linked entities.
- Clicking a list item opens that entity's **card** in a new column to the
  right.
- Clicking an earlier column trims the trail back to that point.

The trail is a path through the graph, which also makes it a query. It is
mirrored in the URL so a trail can be shared.

## Queries per column

1. **Card:** the label plus core literal properties of one entity (cheap).
2. **Aggregations:** outgoing and incoming links grouped by predicate,
   direction and target type, with counts. Counts are lazy and capped (for
   example "100+"), because not every endpoint is QLever.
3. **List:** a paginated, labelled, sorted page of the linked entities.

## Generic first, lenses second

- **Generic mode** works on any endpoint. Labels come from a list of candidate
  properties. Links are discovered from the data.
- **Lenses** are per-type overrides in JSON, in the spirit of Fresnel:
  - title and summary fields (properties or property paths)
  - sort orders
  - hidden plumbing types, e.g. BHL `PagePosition`

## What exists so far

- Start column: exact-label search (or paste an IRI), start entities, and the
  types in use, with capped counts.
- Card column: a single card with the entity's literals as plain text (lens
  summary fields first) and its link groups along the bottom as buttons with
  count badges. Outgoing links to untyped resources (sameAs, url) are shown
  inline and open their card (how to mark internal vs external links is an
  open question). Literals typed as dates (`xsd:date`,
  `dateTime`, `gYear`, `gYearMonth`) are clickable and list everything with
  that value, e.g. all BHL titles issued in 1860.
- List columns hold entity cards; the card leading to the next column is
  highlighted.
- Link groups by (direction, predicate, target type). They are discovered from
  a sample of 2,000 links, and saturated groups get lazy counts capped at
  10,000. Every group opens a list, even of one, so each column is a hop
  along an edge.
- List columns are paged 50 at a time. A list is sorted by the lens sort key
  or by label only when it has 5,000 members or fewer. Larger lists come in
  endpoint order, because sorting 100k members times out on Oxigraph.
- **Map view.** When some of the first page of a list have coordinates, the
  list header offers a List | Map switch. Map mode widens the same column (a
  map is another view of the set, not another hop) and plots the first 1,000
  members with points, via Leaflet loaded from cdnjs on first use. Clicking a
  point opens its card in the next column; the current card's point is
  highlighted. Point properties are config, not code: WKT literals
  (`wdt:P625`, `geo:asWKT`) and latitude/longitude pairs (DwC, W3C geo,
  schema.org) under `defaults.geo` in `config/endpoints.json`. The view is
  kept in the URL (`view=map`).
- Predicates are named from the store's own labels when it has them (HPO's
  `IAO_0000115` shows as "definition"), or from lens `predicateLabels`.
- Wherever a lens names a property it can give a property path instead, e.g.
  `skosxl:prefLabel/skosxl:literalForm` as a label, or extra card `fields`
  such as `schema:address/schema:addressCountry` through a blank node.
- Lenses support title templates with fallbacks, summary fields, sort keys,
  image templates (BHL page thumbnails), edge labels, and hidden types and
  predicates.

Engine notes learned the hard way: never fetch several subjects with
`VALUES ?x { ... } ?x ?p ?o`. Oxigraph plans it badly, and QLever scanned the
whole of full BHL (60s+, and the endpoint briefly returned 502s). Batch lookups
use a UNION with one branch per subject bound as a constant instead, which is
an index lookup on every engine.
`ORDER BY` over about 100k rows times out, and so does `SELECT DISTINCT ?t
WHERE { ?s a ?t }` on a large store (about 4.5s on CoL). Set `"types"` in the
endpoint config to skip that query.

## Later

- **More list views** in the style of SIMILE Exhibit, offered according to
  what the set contains (map is done; see above):
  - binned map (grid cells over a capped sample) for large sets, and
    non-point geometries
  - timeline, for members with dates
  - gallery, for members with images
  - network, for members linked to each other (citations, coauthorship,
    parentTaxon), as in ResearchRabbit
- **Parallax-style pivots** from a set to a set, e.g. from a Title's Items
  to the Pages of all of them. This replaces the lens "virtual edges" tried
  earlier: the trail itself composes the path, with no per-type config.

## Test endpoints

| Store | Endpoint | Engine | Notes |
|---|---|---|---|
| Catalogue of Life | https://iphylo.org/col/query | Oxigraph, small machine | schema.org (**https**), Bioschemas, DwC; tree via `schema:parentTaxon`; CORS open |
| BHL sample | https://koetai.semscape.org/u/0000-0001-9773-4008/bhl-sample/sparql | QLever | Dublin Core, bibo, FOAF, bhlv; lots of indirection |
| BHL (full) | https://koetai.semscape.org/u/0000-0001-9773-4008/bhl/sparql | QLever | Same model; 64M pages, 210M name mentions |
| Human Phenotype Ontology | https://koetai.semscape.org/u/0000-0001-9773-4008/human-phenotype-ontology/sparql | QLever | OWL; tree via `rdfs:subClassOf`; predicates carry their own `rdfs:label`s |
| Crossref Funder Registry | https://koetai.bionames.org/u/0000-0002-7101-9767/registry/sparql | QLever | SKOS-XL: labels are `skosxl:Label` nodes; addresses are blank nodes |
| GBIF | https://qlever.dev/api/gbif | QLever | 3.66 billion occurrences (DwC); coordinates as `dwc:decimalLatitude`/`Longitude` and WKT points (`wdt:P625`); taxa via `skos:broader` |

## Inspiration

- iPhylo blog post: [Library interfaces, knowledge graphs, and Miller columns](https://iphylo.blogspot.com/2023/04/library-interfaces-knowledge-graphs-and.html)
- [Flow browser](https://medium.com/david-regev-on-ux/flow-browser-b730daf0f717)
- Scispace "trace" view; ResearchRabbit
- SemSpect (type-level reachability); Parallax; SIMILE Exhibit; Fresnel
- `~/Sites/grouse`, especially the Phase 3 relationships query in its TODO
- `~/Sites/interface-templates/miller columns/1.html` (the original mockup)
- https://github.com/rdmpage/react-miller-columns (ideas only)

## Logo

Joe Miller's porkpie hat, from *The Expanse*. Miller follows one lead to the
next until he ends up somewhere nobody expected, which is what browsing a trail
of columns feels like.
