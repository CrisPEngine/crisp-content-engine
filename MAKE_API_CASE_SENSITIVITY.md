# Make API URL case sensitivity (Jan 30, 2026)

Make announced that from **January 30, 2026** the Make API will enforce **strict case sensitivity** for all endpoint URLs. Only URLs that exactly match the [API reference](https://developers.make.com/api-documentation/api-reference) will work.

**Example:** `/v2/Organizations` will fail; the correct path is `/v2/organizations` (lowercase).

---

## Status for this project

### ✅ This app does **not** call the Make API

- The app only calls **Make webhook URLs** (e.g. `MAKE_CONTENT_GENERATION_WEBHOOK_URL`, `MAKE_STRATEGY_WEBHOOK_URL`). Those are custom webhook endpoints like `https://hook.eu2.make.com/...` that **trigger** Make scenarios.
- Webhook URLs are **not** the “Make API”; the case-sensitivity change applies to the **Make REST API** at `https://{zone}.make.com/api/v2/...` (used to manage organizations, scenarios, connections, etc.).
- There are **no** references to `api.make.com`, `make.com/api/v2`, or paths like `/v2/Organizations` in this codebase. **No code changes are required** for the Jan 30 update.

### If you use the Make API inside Make.com scenarios

If you add **HTTP** or **Make API** modules in Make that call the Make API (e.g. to list scenarios or organizations), use **lowercase** paths exactly as in the reference:

- Base: `https://eu1.make.com/api/v2` (or your zone: `eu2`, `us1`, `us2`)
- Paths: `/organizations`, `/scenarios`, `/connections`, `/users`, `/hooks`, etc. — all lowercase.

Reference: [Make API Reference](https://developers.make.com/api-documentation/api-reference).
