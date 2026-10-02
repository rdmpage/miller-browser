// Built-in settings. An endpoint (or the options passed to mount()) can
// override any of these.

export const DEFAULTS = {
  // Candidate label properties, in order of preference. A lens can add more
  // (including property paths) in front of these.
  labelProperties: [
    'http://www.w3.org/2004/02/skos/core#prefLabel',
    'http://www.w3.org/2000/01/rdf-schema#label',
    'https://schema.org/name',
    'http://schema.org/name',
    'http://purl.org/dc/terms/title',
    'http://purl.org/dc/elements/1.1/title',
    'http://xmlns.com/foaf/0.1/name',
  ],

  // Every query is bounded: links are discovered from a sample, counts are
  // capped, lists are paged and only sorted when small.
  sampleLimit: 2000,
  countCap: 10000,
  sortLimit: 5000,
  pageSize: 50,
  timeoutMs: 25000,
  maxConcurrent: 3,

  // How an entity can carry a point, for the map view: WKT literals, or
  // latitude/longitude pairs.
  geo: {
    wkt: [
      'http://www.wikidata.org/prop/direct/P625',
      'http://www.opengis.net/ont/geosparql#asWKT',
    ],
    latLong: [
      ['http://rs.tdwg.org/dwc/terms/decimalLatitude', 'http://rs.tdwg.org/dwc/terms/decimalLongitude'],
      ['http://www.w3.org/2003/01/geo/wgs84_pos#lat', 'http://www.w3.org/2003/01/geo/wgs84_pos#long'],
      ['https://schema.org/latitude', 'https://schema.org/longitude'],
    ],
  },
  mapLimit: 1000,
};
