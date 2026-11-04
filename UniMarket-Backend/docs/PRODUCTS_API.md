# Products, Categories & Favorites API (Backend Stage 3)

Written for: frontend and backend developers connecting the React app to the Spring Boot API.

All endpoints are under `/api`. Errors use the common `ApiErrorResponse` shape (`code`, `message`,
optional `fieldErrors[]`); branch on `code`. Money is whole VND (integers). Times are ISO-8601 UTC instants.
Enum values are UPPER_CASE in the API and mapped to the SQL values (see `FRONTEND_INTEGRATION.md` §2).

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/products` | public | Catalog (search, filters, sort, pages, facets) |
| GET | `/api/products/{id}` | public (token optional) | Product page |
| GET | `/api/categories` | public | Active categories with available counts |
| GET | `/api/universities` | public | Universities with campuses |
| GET | `/api/campuses?universityId=` | public | Campuses |
| POST | `/api/products` | student/admin | Create a listing (multipart) |
| PUT | `/api/products/{id}` | owner or admin | Edit a listing |
| DELETE | `/api/products/{id}` | owner or admin | Remove a listing (soft) |
| POST | `/api/products/{id}/images` | owner or admin | Add photos (multipart) |
| DELETE | `/api/products/{id}/images/{imageId}` | owner or admin | Delete one photo |
| PUT | `/api/products/{id}/images/order` | owner or admin | Reorder photos |
| GET | `/api/me/products` | signed in | "My listings" |
| GET | `/api/me/favorites` | signed in | Saved items |
| PUT | `/api/me/favorites/{productId}` | signed in | Save an item |
| DELETE | `/api/me/favorites/{productId}` | signed in | Un-save an item |
| GET | `/media/products/{file}` | public | Uploaded photo files |

"Signed in" means a valid bearer token of an active, verified account (Stage 2 rules, unchanged).

---

## Visibility rules

| Listing state (SQL) | Catalog | Product page | Favorites (add) | Owner / admin |
|---|---|---|---|---|
| `Available` + `Approved` (seller active, category active) | yes | yes, `purchasable: true` | yes | yes |
| `Reserved` / `Sold` + `Approved` | no | yes, `purchasable: false` | yes | yes |
| `Pending` or `Rejected` moderation | no | **404** | 404 | yes (with `moderation`) |
| `Draft` / `Removed` | no | **404** | 404 | Draft yes; Removed 404 |

The catalog uses the same condition as `dbo.vw_ProductCatalog`.

---

## GET /api/products: catalog

Query parameters (all optional):

| Param | Type | Notes |
|---|---|---|
| `q` | text ≤ 100 | Title contains (case-insensitive, Vietnamese OK). `%`, `_`, `[` are literal. |
| `categoryId` | int | Category id (from `/api/categories`) |
| `condition` | `NEW`, `LIKE_NEW`, `USED` | Repeat (`condition=NEW&condition=USED`) or comma-separate |
| `campusId` | int | Campus id |
| `universityId` | int | University id |
| `sellerId` | int | One seller's public listings (public profile / shop) |
| `minPrice`, `maxPrice` | int ≥ 0 | Inclusive; `minPrice ≤ maxPrice` |
| `featured` | bool | Only listings with a running **paid** promotion (`ProductPromotions`, `Status='Paid'`, now within `StartsAt–EndsAt`) |
| `deals` | bool | "Student deals": `originalPrice` set and price at least 40 % below it (`DEAL_MIN_SAVINGS`) |
| `zoneId` | int ≥ 1 | V003 (Stage 6.2): listings whose **effective pickup area** is this zone — `Products.PickupZoneId`, else the zone of the listing's campus (same rule as the `pickupZone` in responses) |
| `province` | text ≤ 100 | V003 (Stage 6.2): effective pickup area in this province / city (`LocationZones.Province`, exact value as returned by `/api/locations/zones`, e.g. `Hà Nội`) |
| `sort` | `newest` (default), `price_asc`, `price_desc` | Ties broken by id (stable paging) |
| `page` | int ≥ 1 | **1-based**, default 1 |
| `size` | 1–50 | Default 20 (the frontend uses 9) |

Invalid values → 400 `VALIDATION_FAILED` with `fieldErrors` (e.g. unknown `sort` or `condition`).

Response:

```json
{
  "items": [
    {
      "id": 12, "title": "Chuột Logitech M331", "price": 180000,
      "condition": "LIKE_NEW", "status": "AVAILABLE", "purchasable": true,
      "category": { "id": 2, "name": "Electronics", "slug": "electronics" },
      "campus": { "id": 1, "name": "FPT Hoa Lac", "universityId": 1, "university": "FPT University" },
      "mainImageUrl": "/images/demo/products/item-12-main.svg",
      "seller": { "id": 3, "fullName": "…" },
      "featured": false, "createdAt": "2026-10-20T03:15:00Z"
    }
  ],
  "page": 1, "size": 9, "totalItems": 35, "totalPages": 4,
  "facets": {
    "conditions": { "NEW": 6, "LIKE_NEW": 15, "USED": 14 },
    "categories": { "1": 5, "2": 9 },
    "campuses": { "1": 35 }
  }
}
```

- `originalPrice` is omitted when not set (no demo listing has one).
- `zoneId` / `province` were added in Stage 6.2 without any schema change (left joins on `PickupZoneId` and
  `Campuses.ZoneId`; many-to-one, so no duplicate rows or counts). Tested in `V003IntegrationTest`.
- `facets` count the public listings that match `q` only (not the other filters), like the frontend mock.
  Category and campus facets are keyed by **id** (as strings). Conditions with 0 are still listed.
- Queries: one page query, one count query (skipped when everything fits on the page), one batch query for
  main photos, one for featured flags and three for facets. The number does not grow with the page size.

## GET /api/products/{id}: product page

```json
{
  "id": 12, "title": "…", "description": "…", "price": 180000,
  "condition": "LIKE_NEW", "status": "AVAILABLE", "purchasable": true,
  "category": { … }, "campus": { … },
  "images": [ { "id": 23, "url": "/images/demo/products/item-12-main.svg", "sortOrder": 0 }, … ],
  "seller": {
    "id": 3, "fullName": "…", "emailVerified": true, "campus": { … },
    "memberSince": "2026-09-01T00:00:00Z", "ratingAverage": 4.5, "ratingCount": 2,
    "contact": { "phone": "09…", "zaloUrl": null }
  },
  "featured": false, "createdAt": "…", "updatedAt": "…"
}
```

- `images` are sorted; the first one is the main photo.
- `seller.contact` (phone / Zalo) is present **only when the seller chose to share it** (`Users.ShowContact = 1`),
  as Business Plan 3.2 and 6.7 require (buyers contact sellers by phone or Zalo; only shared details are shown).
  It is never part of catalog items. The seller's **email is never returned**.
  Current visibility: anyone who can open a public product page (also visitors who are not signed in) sees the
  shared contact. Privacy implications: shared numbers can be collected by scraping product pages; the schema
  default is `ShowContact = 0` (not shared), but 12 of the 17 demo users have it set to 1. Restricting it to
  signed-in students would be a policy change and needs the team's approval.
- With the owner's (or an admin's) token the response also has `moderation` (`PENDING`, `APPROVED`, `BLOCKED`)
  and `editable` (true while `DRAFT`/`AVAILABLE`), and pending/blocked listings are returned instead of 404.
- `seller.emailVerified` = the account confirmed its email with a code (`Users.EmailVerifiedAt`). It is **not** a
  student-status claim: registration accepts any email + OTP (team decision, Nov 2026) and there is no student
  verification. The API never sends `verified` or `verifiedStudent`.

## GET /api/locations/zones (V003, public)

Active demo areas for pickup / delivery: `[{ "id": 2, "code": "HN-CAU-GIAY", "name": "Cầu Giấy", "province": "Hà Nội" }]`.
No coordinates are returned. Areas are approximations used only for simulated shipping estimates.

V003 response changes: listing summaries and details carry `pickupZone` (`{ id, code, name, province }`: the explicit
area, else the campus area) and `campus` may be absent; the seller block of a product page carries `university` and
`affiliationSource` (`OFFICIAL_CAMPUS` / `SELF_DECLARED`). Catalog `facets.campuses` never contains a null key.

## GET /api/categories, /api/universities, /api/campuses

```json
[ { "id": 6, "name": "Bikes & Ride", "slug": "bikes-and-ride", "availableCount": 4 } ]
[ { "id": 1, "name": "FPT University", "code": "FPT", "campuses": [ { "id": 1, "name": "FPT Hoa Lac", "universityId": 1, "university": "FPT University" } ] } ]
[ { "id": 1, "name": "FPT Hoa Lac", "universityId": 1, "university": "FPT University" } ]
```

Only active categories, sorted by name. `slug` is derived from the name (there is no slug column).

---

## POST /api/products: create a listing

`multipart/form-data` with:

- part `listing` (`Content-Type: application/json`):

  ```json
  { "title": "Casio fx-580VN X", "description": "At least 20 characters …", "price": 250000,
    "originalPrice": 400000, "condition": "LIKE_NEW", "categoryId": 1, "campusId": 1 }
  ```

- part(s) `photos`: 1–8 files, each ≤ 5 MB, JPG, PNG or WebP.

Rules (the same as the frontend's `LISTING_LIMITS`):

| Field | Rule |
|---|---|
| `title` | 5–80 characters |
| `description` | 20–1000 characters |
| `price` | 1,000–100,000,000 |
| `originalPrice` | optional; if set, same range and **higher** than `price` |
| `condition` | `NEW`, `LIKE_NEW`, `USED` |
| `categoryId` | an active category, else `INVALID_CATEGORY` |
| `campusId` | optional; must be a campus of the seller's university (`INVALID_CAMPUS`); default = the seller's campus. A seller **without** a campus (self-declared university, V003) cannot send one (`INVALID_CAMPUS`) |
| `pickupZoneId` | V003, optional demo pickup area from `GET /api/locations/zones` (`INVALID_ZONE` if unknown / inactive). **Required** for a seller without a campus (field error `pickupZoneId`). When absent the campus area is used |

- The seller is **always the signed-in account**; any `sellerId`, `status` or `moderation` in the body is ignored.
- New listings are `AVAILABLE` + **`PENDING` moderation** (pre-moderation, decision of 2026-11-01): they are not
  public until an admin approves them. Since Stage 5 an admin approves with `POST /api/admin/listings/{id}/approve`
  `{ "version" }` (see `ADMIN_API.md` §1; audited in `AdminActions`). Never approve by editing the column in SQL.
  Historical note (Stage 3): nothing in the backend or the database set `ModerationStatus = 'Approved'` then (no procedure,
  no trigger; an admin's edit also returns the listing to `PENDING`). The API must not rely on the SQL column default
  (`'Approved'`): it always writes `Pending` explicitly.
- Response: **201** with the product page body (including `moderation: "PENDING"`).

Photo errors: `IMAGE_REQUIRED` (no photo; a request **without any** `photos` part is rejected earlier by Spring as
400 `INVALID_PARAMETER`), `TOO_MANY_IMAGES` (> 8), `INVALID_IMAGE` (content is not JPG/PNG/WebP:
the bytes are checked, the file name and `Content-Type` are ignored), **413 `IMAGE_TOO_LARGE`** (a file over 5 MB).

## PUT /api/products/{id}: edit

JSON body = the `listing` object above. Response 200 with the product page.

- Allowed for the owner or an admin, while the listing is `DRAFT` or `AVAILABLE`.
  `RESERVED`/`SOLD`/`REMOVED` → **409 `LISTING_NOT_EDITABLE`**.
- Every change (also photo changes) puts the listing back to **`PENDING`** moderation (approved decision).
- Someone else's listing → **403 `ACCESS_DENIED`** if it is public, **404** if it is not (no information leak).

## DELETE /api/products/{id}: remove

204. Soft delete: `Status = 'Removed'`; rows and photos are kept (orders, reports and promotions reference them).
Not possible while reserved/sold or part of an open order → 409 `LISTING_NOT_EDITABLE`.

## Photos

| Call | Body | Notes |
|---|---|---|
| `POST /api/products/{id}/images` | multipart `photos` | Appended after the existing photos; total ≤ 8 |
| `DELETE /api/products/{id}/images/{imageId}` | — | The last photo cannot be deleted (`IMAGE_REQUIRED`); the file is deleted after commit |
| `PUT /api/products/{id}/images/order` | `{ "imageIds": [31, 29, 30] }` | Must list every photo exactly once; the first becomes the main photo |

All return 200 with the product page and need the listing to be editable (409 otherwise).

## GET /api/me/products: my listings

All own listings except removed ones, newest first, as catalog items plus `moderation` and `editable`.

## Favorites

| Call | Result |
|---|---|
| `GET /api/me/favorites` | Saved listings that are still public (available, reserved or sold), newest saved first, as catalog items. Hidden listings stay saved but are not shown. |
| `PUT /api/me/favorites/{productId}` | **201** `{ "productId": 12, "saved": true, "created": true }`; already saved → **200** with `created: false` (no duplicate). Non-public or unknown listing → 404. |
| `DELETE /api/me/favorites/{productId}` | 204, also when it was not saved. |

The user is always taken from the token; a user can only read or change their own favorites.

---

## Photo storage (development)

Approved decision Q2: photos are stored on the server's disk behind the `ImageStorage` interface
(`LocalDiskImageStorage`), so a cloud store can replace it later without API changes.

- Folder: `<UPLOAD_DIR>/products/` (`UPLOAD_DIR` env var). The default `uploads` is relative to the directory the
  backend is started from, so set an absolute path in `.env` outside development. `uploads/` is git-ignored at
  any level.
- File names are random (`<32 hex>.jpg|png|webp`); the original name is never used. The extension comes from
  the detected content.
- Served read-only at `/media/products/<file>` with a 30-day public cache (files never change).
- `ProductImages.ImageUrl` stores `/media/products/<file>`. Deleting only touches files matching that pattern
  inside the folder.
- Demo rows keep their stored values (`images/demo/products/…svg`, not rewritten). The API returns relative
  references root-relative (`/images/demo/products/…svg`). No SVG file is shipped: the frontend maps each reference
  (`src/utils/demoImages.js` + manifest `src/data/demoProductPhotos.json`) to an openly licensed **reference photo**
  (`public/images/demo/products/photos/item-NN-{front|detail}.webp`, labelled "Ảnh tham khảo", credits in
  `photos/CREDITS.md`). Listings without a verified photo show the neutral `ImageSlot` placeholder. No data change was
  needed; missing static images return 404 in Vite dev/preview (production hosting must do the same).
- Limits: `spring.servlet.multipart.max-file-size=5MB` (also checked again in the service),
  `max-request-size=41MB`, `server.tomcat.max-swallow-size=42MB`, `unimarket.listing.max-photos=8`.

### Storage audit (Stage 3 review)

| Check | Result |
|---|---|
| Path traversal | File names are generated by the server; `delete` accepts only `/media/products/<32 hex>.<ext>` and checks the resolved path stays in the folder; the static handler rejects `..` (tested with encoded `../`, `..\`). |
| Access control | Upload, delete and reorder: owner or admin only. Files are public by URL (random 128-bit names, no directory listing). Photos of pending, blocked or removed listings stay reachable to anyone who already has the URL. |
| Formats | JPG, PNG, WebP by magic bytes; name and `Content-Type` ignored; served with the extension's type and `X-Content-Type-Options: nosniff`. Images are not decoded or re-encoded. |
| Metadata (Stage 6.4) | **New uploads are stored without EXIF (incl. GPS), XMP, IPTC and text metadata** (`ImageMetadataStripper`: JPEG APP1 / APP13 / COM segments, PNG `eXIf` / `tEXt` / `zTXt` / `iTXt` / `tIME` chunks, WebP `EXIF` / `XMP ` chunks and VP8X flags). Image data and ICC colour profiles are copied unchanged. A file whose structure can't be parsed is stored as before (logged). **Photos uploaded before Stage 6.4 are not rewritten** and may still contain metadata. Tested in `ImageMetadataStripperTest` and `ProductIntegrationTest.PhotoPrivacy`. |
| Orphan files | Deleted when creating/adding fails (any exception before commit) and after the commit of a photo delete. Removing a listing keeps its files (soft delete). A crash between writing the file and the commit can still leave a file; there is no cleanup job. |
| Configuration | `UPLOAD_DIR`; files are written with `CREATE_NEW`; the folder is created on first upload. |

Status: disk storage is the approved MVP choice (Q2) and is fine for development and the demo. Before a real
deployment: clean the metadata of photos uploaded before Stage 6.4 (offline, on a copy), add an orphan-file cleanup
job, back up the folder with the database, and consider not serving photos of hidden listings.

## Concurrency

Edit, remove and photo changes lock the listing row (`UPDLOCK`), the same lock `usp_Checkout` takes. So a listing
being checked out cannot be edited at the same moment; whichever comes second sees the new status.
