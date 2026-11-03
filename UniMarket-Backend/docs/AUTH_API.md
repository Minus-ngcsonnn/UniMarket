# Authentication API (Backend Stage 2)

Written for: frontend and backend developers connecting the React app to the UniMarket API.

Base path: `/api/auth`. JSON in and out (UTF-8). Errors always use the shared format
(`timestamp`, `status`, `error`, `code`, `message`, `path`, optional `fieldErrors[]`); clients branch on `code`.

Authentication is **stateless**: a signed JWT access token (HS256, 1 hour by default) is sent as
`Authorization: Bearer <token>`. No cookies, no server sessions.

> **V003 (tested on an isolated copy, not yet applied to `UniMarketJava`).** This backend version needs the V003
> schema; it does not start against a V002-only database (`ddl-auto=validate`). See
> `database/docs/V003_DESIGN_nationwide_and_simulated_shipping.md`.

## Endpoints

| Method | URL | Auth | Success |
|---|---|---|---|
| POST | `/api/auth/register` | public | 201 |
| POST | `/api/auth/verify-email` | public | 200 |
| POST | `/api/auth/resend-verification` | public | 202 |
| POST | `/api/auth/login` | public | 200 |
| GET | `/api/auth/me` | Bearer token | 200 |

There is **no logout endpoint**. Signing out = the browser deletes its token. A token that was already
issued stays valid until it expires (no server-side revocation), unless the account is suspended, closed
or deleted – every request re-reads the account from the database.

### POST /api/auth/register

Request:

| Field | Type | Rules |
|---|---|---|
| `fullName` | string | required, 2–150 characters |
| `email` | string | required, **any valid email address** (Gmail, Outlook, Yahoo, a university address, …), ≤ 254, with a dotted domain (`a@localhost` is refused, as by the database CHECK). The domain decides nothing: not eligibility, not university, not campus (team decision, Nov 2026). |
| `password` | string | required, 8–72 characters (≤ 72 bytes), at least one letter and one digit |
| `campusId` | number | an official campus from `GET /api/campuses` (must exist), **or** … |
| `universityName` | string | … the university / college typed as free text when it is not listed (2–200 characters after trimming; inner spaces collapsed). Stored as **self-declared**, never matched to or inserted into `Universities`, never shown as verified. **Exactly one** of `campusId` / `universityName` is required (field error `affiliationProvided`; a 1-character name → `universityNameLongEnough`). Never derived from the email. |
| `homeZoneId` | number | optional default area from `GET /api/locations/zones` (`INVALID_ZONE` if unknown / inactive) |

Any other field (e.g. `"role": "Admin"`) is ignored: public registration always creates a **STUDENT**.

Response 201:

```json
{
  "user": { "id": 18, "email": "an.nguyen@gmail.com", "fullName": "Nguyễn An", "role": "STUDENT",
            "emailVerified": false, "campusId": 1, "campusName": "FPT Hoa Lac", "university": "FPT University",
            "affiliation": { "campusId": 1, "campusName": "FPT Hoa Lac", "universityName": "FPT University",
                             "source": "OFFICIAL_CAMPUS" },
            "homeZone": null, "memberSince": "2026-11-02T11:00:00Z" },
  "verificationRequired": true,
  "codeExpiresAt": "2026-11-02T11:10:00Z",
  "emailDelivery": "SENT"
}
```

**Registration policy (team decision, Nov 2026).** UniMarket is for university and college students across Vietnam.
Any valid email address can register; `dbo.UniversityEmailDomains` is no longer used. The emailed code proves
**ownership of the email address only** — it does not prove enrolment. `emailVerified` is therefore not a student
status, `role: "STUDENT"` is simply the ordinary marketplace account role, and the API has no `verified` /
`verifiedStudent` field. No student-ID, FAP, SSO or manual student approval exists.

**Affiliation (V003).** A student whose school has no official campus row types its name. Then `campusId` and
`campusName` are `null`, `university` is the typed name and `affiliation.source` is `SELF_DECLARED` (otherwise
`OFFICIAL_CAMPUS`; admins without either: `NONE`). The UI must label a self-declared name as such.

A 6-digit code is e-mailed (never returned by the API). The account and the code are committed first; the e-mail is
sent afterwards, outside the transaction, and `emailDelivery` reports the real outcome:

| `emailDelivery` | Meaning |
|---|---|
| `SENT` | the provider (Resend / SMTP) accepted the message — not a guarantee that it reached the inbox |
| `LOGGED` | development `MAIL_MODE=log`: nothing was sent, the e-mail is in the backend log |
| `FAILED` | refused or no answer (invalid key, unverified sender domain, rate limit, timeout). The account exists and is unverified: request a new code after 60 s (`resend-verification`); registering again answers `EMAIL_ALREADY_REGISTERED` |

Errors:

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | missing / invalid fields (`fieldErrors`), e.g. neither / both of `campusId` and `universityName`, password > 72 bytes |
| 400 | `INVALID_CAMPUS` | the campus does not exist |
| 400 | `INVALID_ZONE` | `homeZoneId` is not an active area |
| 409 | `EMAIL_ALREADY_REGISTERED` | email already used (case-insensitive) |

### POST /api/auth/verify-email

Request: `{ "email": "...", "code": "123456" }` (code: exactly 6 digits).

Response 200: `{ "message": "Your email is verified. You can now sign in." }`

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | code not 6 digits |
| 400 | `INVALID_VERIFICATION_CODE` | wrong, expired (10 min), already used or replaced code; also unknown or already verified email (same answer on purpose) |
| 429 | `TOO_MANY_ATTEMPTS` | 5 wrong codes: the current code is closed; request a new one |

### POST /api/auth/resend-verification

Request: `{ "email": "..." }`

Response 202 (always the same, whether or not a code was sent, so emails cannot be probed):
`{ "message": "If this email belongs to an account that still needs verification, a new code has been sent. ..." }`

A new code is sent only to an active, unverified account, at most once per **60 s** and **5 codes per hour**.
A new code closes all older codes of the account.

| Status | `code` | When |
|---|---|---|
| 503 | `EMAIL_DELIVERY_FAILED` | a new code was issued but the e-mail provider refused it or did not answer; the undelivered code is closed. Try again after the cooldown. (Only possible for a pending account while the provider fails — an accepted, narrow disclosure.) |

### POST /api/auth/login

Request: `{ "email": "...", "password": "..." }` (email case-insensitive).

Response 200:

```json
{ "accessToken": "eyJ...", "tokenType": "Bearer", "expiresIn": 3600,
  "expiresAt": "2026-11-02T12:00:00Z", "user": { ...same as register... } }
```

| Status | `code` | When |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | unknown email **or** wrong password (same message, same timing) |
| 403 | `EMAIL_NOT_VERIFIED` | correct password, email not verified yet → show the code dialog / resend |
| 403 | `ACCOUNT_DISABLED` | correct password, account `Suspended` or `Closed` |
| 429 | `TOO_MANY_ATTEMPTS` | 5 failed logins for this email within 15 minutes |

### GET /api/auth/me

Header `Authorization: Bearer <token>`. Response 200: the `user` object above.
401 `AUTHENTICATION_REQUIRED` when the token is missing, malformed, expired, wrongly signed, has the wrong
issuer/audience, or the account can no longer sign in.

## Authorization rules (all endpoints)

| Request | Rule |
|---|---|
| `GET /api/health`, `GET /actuator/health` | public |
| `POST /api/auth/register`, `verify-email`, `resend-verification`, `login` | public |
| `GET /api/products/**`, `GET /api/categories/**`, `GET /api/campuses`, `GET /api/universities` | public (Stage 3) |
| `/api/admin/**` | role ADMIN only → 403 `ACCESS_DENIED` for students |
| everything else | any signed-in account → 401 `AUTHENTICATION_REQUIRED` otherwise |

Only active accounts with a verified email address can obtain a token, so "signed in" means an email-verified
marketplace account (role STUDENT) or an admin — not a verified student.
Roles come from `dbo.Users.Role` on every request, never from the token or the frontend.

## Token contents

`iss = unimarket-api`, `aud = unimarket-web`, `sub = user id`, `iat`, `exp`, `jti`. No email, name, role or
other personal data. Signed with HS256; the key comes from `JWT_SECRET` (Base64, ≥ 32 bytes).

## Configuration (environment / `UniMarket-Backend/.env`)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Base64 HMAC key (≥ 32 bytes) for access tokens. Required outside the `dev` profile. |
| `VERIFICATION_CODE_SECRET` | Base64 HMAC key (≥ 32 bytes) used to hash codes before storing them. |
| `JWT_ACCESS_TOKEN_TTL` | token lifetime, ISO-8601 (default `PT1H`) |
| `CORS_ALLOWED_ORIGINS` | exact browser origins (default `http://localhost:5173`; the Vite proxy makes CORS unnecessary in dev) |
| `MAIL_MODE` | `resend` (real e-mail through the Resend API), `smtp`, or `log` (dev: codes written to the console, nothing sent). The `dev` profile defaults to `log`, other profiles to `smtp`. |
| `RESEND_API_KEY` | Resend API key ("Sending access" is enough). Secret: only in the environment / git-ignored `.env`, never in `VITE_*`. With `MAIL_MODE=resend` a missing key stops the startup (no fallback to logging codes). |
| `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | sender address on a domain **verified in the Resend dashboard** (Domains), and display name (default `UniMarket`). The testing sender `onboarding@resend.dev` only delivers to the Resend account owner's own address. |
| `RESEND_TIMEOUT` | request timeout, ISO-8601 (default `PT10S`) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP settings when `MAIL_MODE=smtp` |

With the `dev` profile (default) missing secrets are replaced by random keys at startup, with a warning:
tokens and codes then stop working after a restart. Set both secrets in `.env` for a stable local setup.

## Verification e-mail

`VerificationEmailTemplate`: subject "Mã xác thực UniMarket của bạn"; Vietnamese HTML (inline styles, responsive, UTF-8)
plus a plain-text version; UniMarket branding, welcome heading, the code in large type, 10-minute validity with the
expiry time (Vietnam time), "do not share" warning, and "ignore this e-mail if you did not register". The name is
HTML-escaped. In `resend` / `smtp` modes codes are never logged.

## How codes are stored

`EmailVerificationTokens.TokenHash = HMAC-SHA-256(VERIFICATION_CODE_SECRET, "email-verification:" + userId + ":" + code)`.
The plain code exists only in the e-mail. Verification calls the existing procedure `dbo.usp_VerifyEmail`,
which consumes the code and sets `Users.EmailVerifiedAt` in one transaction.
