// Public entry for tests/tooling. Browser code imports transport/client directly:
// Vite's fixed /api proxy also matches source URLs under this directory.
export { ApiError, createApi, imageUrl } from '../transport/client';
export type { ApiClient } from '../transport/client';
