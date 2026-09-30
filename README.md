# miller-browser

Browse a SPARQL knowledge graph as a trail of Miller columns, without
confronting the user with a node-link diagram.

Vanilla HTML, CSS and JavaScript. No framework, no build step.

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
  - title and summary fields
  - *virtual edges* written as SPARQL property paths, e.g. BHL
    Title ← isPartOf Item ← isPartOf Part
  - sort orders
  - hidden plumbing types, e.g. BHL `PagePosition`

## Later

- **List views** in the style of SIMILE Exhibit, offered according to what the
  set contains:
  - map, for members with coordinates
  - timeline, for members with dates
  - gallery, for members with images
  - network, for members linked to each other (citations, coauthorship,
    parentTaxon), as in ResearchRabbit
- **Parallax-style pivots** from a set to a set.

## Test endpoints

| Store | Endpoint | Engine | Notes |
|---|---|---|---|
| Catalogue of Life | https://iphylo.org/col/query | Oxigraph, small machine | schema.org (**https**), Bioschemas, DwC; tree via `schema:parentTaxon`; CORS open |
| BHL | (Koetai QLever endpoint) | QLever | Dublin Core, bibo, FOAF, bhlv; lots of indirection |

## Inspiration

- iPhylo blog post: [Library interfaces, knowledge graphs, and Miller columns](https://iphylo.blogspot.com/2023/04/library-interfaces-knowledge-graphs-and.html)
- [Flow browser](https://medium.com/david-regev-on-ux/flow-browser-b730daf0f717)
- Scispace "trace" view; ResearchRabbit
- SemSpect (type-level reachability); Parallax; SIMILE Exhibit; Fresnel
- `~/Sites/grouse`, especially the Phase 3 relationships query in its TODO
- `~/Sites/interface-templates/miller columns/1.html` (the original mockup)
- https://github.com/rdmpage/react-miller-columns (ideas only)
