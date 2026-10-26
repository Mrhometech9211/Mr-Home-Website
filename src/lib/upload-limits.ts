/**
 * Upload ceilings shared by the admin client, API validation and the R2
 * upload service. Dependency-free so both browser and server code import the
 * same number instead of re-declaring the limit.
 *
 * Brochures bypass Vercel request bodies entirely (presigned direct-to-R2
 * multipart uploads), so the ceiling is an object-storage policy, not a
 * serverless body limit.
 */
export const BROCHURE_MAX_BYTES = 200 * 1024 * 1024; // 200 MiB = 209,715,200 bytes

/** Human label used in validation messages ("200 MB"). */
export const BROCHURE_MAX_LABEL = `${BROCHURE_MAX_BYTES / 1024 / 1024} MB`;
