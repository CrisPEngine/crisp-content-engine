/** Days before a product screenshot/UI asset is flagged as possibly stale. */
export const STALE_SCREENSHOT_DAYS = parseInt(process.env.ASSET_STALE_SCREENSHOT_DAYS || '90', 10);

/** Do not reuse the same asset on the same channel within this window (days). */
export const ASSET_REUSE_COOLDOWN_DAYS = parseInt(process.env.ASSET_REUSE_COOLDOWN_DAYS || '14', 10);

/** Minimum match score (after boosts) to auto-attach a library asset at generation time. */
export const AUTO_ATTACH_MIN_SCORE = parseFloat(process.env.ASSET_AUTO_ATTACH_MIN_SCORE || '3');

export const EMBEDDING_MODEL = process.env.ASSET_EMBEDDING_MODEL || 'text-embedding-3-small';
