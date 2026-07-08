---
name: curl testing with secure session cookies
description: How to test authenticated routes with curl in dev — session cookies require an HTTPS-forwarded header
---

Session cookies are configured with `secure: true` and the app uses `trust proxy`. Over plain `http://localhost:5000`, express-session never sends `Set-Cookie`, so curl cookie jars stay empty and authenticated requests silently return 401.

**Why:** express-session refuses to issue secure cookies on connections it considers insecure; the proxy trust means it decides based on `X-Forwarded-Proto`.

**How to apply:** when curl-testing any authenticated route in dev, add `-H 'X-Forwarded-Proto: https'` to BOTH the login/register request (to receive the cookie) and subsequent requests. Real browsers are unaffected (they connect via HTTPS through the Replit proxy).
