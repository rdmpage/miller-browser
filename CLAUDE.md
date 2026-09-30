# miller-browser: working notes

- **Vanilla HTML, CSS and JavaScript only.** Never use React or any other
  framework, a bundler or a build step. Plain ES modules served statically
  (`php -S localhost:8000` or any static server). The React
  react-miller-columns fork is for ideas only; do not port its code structure.
- Stay generic across SPARQL endpoints. Put endpoint-specific tweaks in JSON
  config or lens files, never in code paths.
- Assume slow endpoints (Oxigraph on a small machine). Every query must be
  bounded (LIMIT, capped counts), and the UI must render before counts arrive.
- See README.md for the design.
