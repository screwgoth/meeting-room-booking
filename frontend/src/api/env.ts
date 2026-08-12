// Single place the mock/live switch is read from `import.meta.env`. Isolated so the
// rest of the API layer stays free of `import.meta` (which the Jest CommonJS
// transform can't parse) — tests map this module to a stub. Defaults to mocks until
// Sam's endpoints are all live; flip with `VITE_USE_MOCKS=false`.
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
