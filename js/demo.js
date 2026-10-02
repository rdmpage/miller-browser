// The demo page: an endpoint picker over config/endpoints.json, with one
// browser mounted below it. The endpoint is kept in the URL hash as `ep`,
// alongside the browser's own trail parameters, so links stay shareable.

import { mount } from './browser.js';

const pickerEl = document.getElementById('endpoint');
const host = document.getElementById('browser');
const config = await (await fetch('config/endpoints.json')).json();

let browser = null;
let current = null;

const hashParams = () => new URLSearchParams(location.hash.slice(1));

function start(id) {
  const ep = config.endpoints.find((e) => e.id === id) || config.endpoints[0];
  if (browser && current === ep.id) return;
  browser?.destroy();
  current = ep.id;
  pickerEl.value = ep.id;

  // Make sure the hash names the endpoint, first, without adding a history entry.
  const rest = [...hashParams()].filter(([k]) => k !== 'ep');
  const hash = `#${new URLSearchParams([['ep', ep.id], ...rest])}`;
  if (location.hash !== hash) history.replaceState(history.state, '', hash);

  const { id: _id, lens, ...endpoint } = ep;
  browser = mount(host, { endpoint: { ...config.defaults, ...endpoint }, lens });
  document.title = `${ep.name} · miller-browser`;
}

for (const ep of config.endpoints) {
  pickerEl.append(Object.assign(document.createElement('option'), { value: ep.id, textContent: ep.name }));
}
pickerEl.addEventListener('change', () => {
  history.pushState(null, '', `#ep=${encodeURIComponent(pickerEl.value)}`);
  start(pickerEl.value);
});
// Registered before any browser's own listener, so a change of endpoint
// (Back across endpoints) remounts before the old browser re-renders.
window.addEventListener('popstate', () => start(hashParams().get('ep')));

start(hashParams().get('ep'));
