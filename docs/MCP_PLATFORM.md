# MCP platform

CCE exposes one MCP endpoint: `https://app.crispdigital.io/api/mcp`.

Bearer credentials remain the advanced and server-to-server path. OAuth 2.1 authorization-code with PKCE is available for clients that can complete it.

Discovery:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`

Consent is signed-in CCE authorization. Requested scopes map onto the existing capability model. Direct approval, publishing, community publishing, and ad activation are not granted because a client asked for them.

Client compatibility is dated in `src/lib/mcp/oauth.ts`. A status of documentation-only is not a live test.

OAuth can be turned off with `MCP_OAUTH_ENABLED=false` without disabling bearer credentials.
