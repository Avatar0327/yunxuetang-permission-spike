/** Central strategy entry points for owning application modules; no repositories are exported. */
export { Authority } from './revision.js';
export { assertGrantSubset } from './delegation.js';
export { ObjectResolver } from './objects.js';
export { nodes } from './registry.js';
export { compile } from './compiler.js';
export type { CandidateName } from './bulk-candidate.js';
export type { CatalogGrant } from './contracts.js';
export { normalizePolicy } from './policy.js';
