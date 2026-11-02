# Authentication API (Backend Stage 2)

Written for: frontend and backend developers connecting the React app to the UniMarket API.

Base path: `/api/auth`. JSON in and out (UTF-8). Errors always use the shared format
(`timestamp`, `status`, `error`, `code`, `message`, `path`, optional `fieldErrors[]`); clients branch on `code`.

Authentication is **stateless**: a signed JWT access token (HS256, 1 hour by default) is sent as
`Authorization: Bearer <token>`. No cookies, no server sessions.

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
| `email` | string | required, valid email, ≤ 254; **domain must be an approved university domain** (`dbo.UniversityEmailDomains`, today `fpt.edu.vn`; subdomains and personal email are refused) |
| `password` | string | required, 8–72 characters (≤ 72 bytes), at least one letter and one digit |
| `campusId` | number | optional; must be a campus of the email's university; may be omitted when the university has one campus (FPT: "FPT Hoa Lac") |

Any other field (e.g. `"role": "Admin"`) is ignored: public registration always creates a **STUDENT**.

Response 201:

```json
{
  "user": { "id": 18, "email": "an.nguyen@fpt.edu.vn", "fullName": "Nguyễn An", "role": "STUDENT",
            "emailVerified": false, "campusId": 1, "campusName": "FPT Hoa Lac",
            "university": "FPT University", "memberSince": "2026-11-02T11:00:00Z" },
  "verificationRequired": true,
  "codeExpiresAt": "2026-11-02T11:10:00Z"
}
```

A 6-digit code is e-mailed (never returned by the API). Errors:

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | missing / invalid fields (`fieldErrors`), password > 72 bytes, campus required |
| 400 | `UNSUPPORTED_EMAIL_DOMAIN` | not an approved university domain |
| 400 | `INVALID_CAMPUS` | campus not of that university |
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
| `GET /api/products/**`, `GET /api/categories/**` | public (reserved for the marketplace stage; not implemented yet) |
| `/api/admin/**` | role ADMIN only → 403 `ACCESS_DENIED` for students |
| everything else | any signed-in account → 401 `AUTHENTICATION_REQUIRED` otherwise |

Only verified, active accounts can obtain a token, so "signed in" always means a verified student or an admin.
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
| `MAIL_MODE` | `log` (dev: codes written to the console, nothing sent) or `smtp` |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP settings when `MAIL_MODE=smtp` |

With the `dev` profile (default) missing secrets are replaced by random keys at startup, with a warning:
tokens and codes then stop working after a restart. Set both secrets in `.env` for a stable local setup.

## How codes are stored

`EmailVerificationTokens.TokenHash = HMAC-SHA-256(VERIFICATION_CODE_SECRET, "email-verification:" + userId + ":" + code)`.
The plain code exists only in the e-mail. Verification calls the existing procedure `dbo.usp_VerifyEmail`,
which consumes the code and sets `Users.EmailVerifiedAt` in one transaction.
