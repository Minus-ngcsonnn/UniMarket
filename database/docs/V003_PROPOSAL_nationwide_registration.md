# V003 proposal – nationwide registration (NOT APPLIED)

Written for: the database owner and the team members who approve schema changes.

> **Superseded for the registration part** by `V003_DESIGN_nationwide_and_simulated_shipping.md` (free-text university,
> optional campus, listing locations, simulated shipping). Section 3 below remains a list of other candidates.

Status: **proposal only. Nothing below has been executed on `UniMarketJava` or on any copy.** It needs explicit team
approval, a full backup and a test run on an isolated copy before it is applied.

## 1. Why the current schema is not enough

The team decided (Nov 2026) that students of any university or college in Vietnam may register with any email
address. The email part is done without schema changes. The campus part is not possible today:

| Fact (V001 + V002) | Consequence |
|---|---|
| `Users.CampusId int NOT NULL` + FK to `Campuses` | every account must point to an existing campus |
| `Products.CampusId int NOT NULL` + FK to `Campuses` | every listing must point to an existing campus |
| `Campuses` has 1 row (FPT Hoa Lac); `Universities` has 1 row (FPT University) | the only campus a new user can choose is FPT Hoa Lac |
| Stage 3: a listing's campus must belong to the seller's university | a non-FPT seller could only list "at FPT Hoa Lac" |

Rules that must not be broken: no automatic FPT Hoa Lac assignment, no invented university or campus, no affiliation
derived from the email domain, no silent change to demo accounts.

**Blocked business cases today:** a student of any university other than FPT (or of another FPT campus) cannot
register with a correct campus, cannot list items at their real campus, and campus/university filters cannot show
their listings correctly. The backend now refuses registration without an explicit, existing `campusId`; it does not
assign one. Registration therefore works end-to-end only for students who genuinely belong to a campus in the table.

## 2. Options

### Option A – reference data only (no schema change) — smallest, recommended first

Insert **real, approved** universities and campuses (e.g. from the Ministry of Education and Training list, starting
with the universities the team targets) into `Universities` / `Campuses`. No table or constraint changes.

```sql
-- DRAFT, NOT EXECUTED. Data must come from an approved, verified source; no placeholder records.
BEGIN TRANSACTION;
INSERT dbo.Universities (Name, Code) VALUES (N'<official name>', '<code>');          -- one row per approved university
INSERT dbo.Campuses (UniversityId, Name, Address) VALUES (SCOPE_IDENTITY(), N'<campus>', N'<address>');
-- verify counts, then COMMIT; rollback = DELETE the inserted rows (no other table references them yet)
COMMIT;
```

- Effect on demo users: none (17 users keep CampusId 1).
- Effect on Stage 3–5 APIs: none; `GET /api/universities` / `/api/campuses` and filters show the new rows.
- Frontend: registration needs a university → campus select from those endpoints (also needed for Option B).
- Limitation: a student whose university is not in the list still cannot register; someone must maintain the list.
- Tests: registration with each new campus; listing campus rule; catalog filters by university/campus.

### Option B – optional campus for accounts (schema change)

Let an account exist without a campus, so registration never forces an affiliation.

```sql
-- DRAFT, NOT EXECUTED.
ALTER TABLE dbo.Users ALTER COLUMN CampusId int NULL;   -- FK stays; NULL = "campus not set"
-- vw_PublicProfiles / vw_ProductCatalog are unaffected (products keep a mandatory CampusId).
INSERT dbo.SchemaMigrations (Version, Description, AppliedAt, AppliedBy)
VALUES ('V003', N'Users.CampusId nullable (nationwide registration)', SYSUTCDATETIME(), SUSER_SNAME());
```

- Effect on demo users: none (values unchanged).
- Effect on APIs: `UserResponse.campusId/campusName/university` become nullable; Stage 3 listing creation must then
  require an explicit listing campus (cannot default to the seller's campus) and the "campus of the seller's
  university" rule must change to "any existing campus" — a business decision; admin user lists must handle NULL.
- `Products.CampusId` stays mandatory: a listing still needs a real campus (pickup/delivery area), so Option B alone
  does not let non-FPT students sell at their campus — it must be combined with Option A.
- Rollback: `UPDATE Users SET CampusId = <approved value> WHERE CampusId IS NULL` is NOT acceptable (it would invent an
  affiliation); rollback is only possible while no NULL rows exist, or by restoring the pre-V003 backup.
- Tests: Hibernate validate (`User.campus` becomes optional), registration with/without campus, `/api/auth/me`,
  listing creation, admin user list/detail, profile endpoints, checkout (buyer campus not used).

### Recommendation

Option A first (data, reversible, no API change). Option B only if the team wants accounts without any campus.

## 3. Other V003 candidates found during the reviews (also NOT applied)

| Item | Why | Smallest change |
|---|---|---|
| Checkout idempotency key | a retried checkout cannot return the first result (409 instead) | `Orders.CheckoutKey varchar(64) NULL` + unique filtered index per buyer |
| One pending promotion per listing, enforced by the database | today enforced by application locking only | `CREATE UNIQUE INDEX UX_PromotionPending ON dbo.ProductPromotions(ProductId) WHERE Status = 'Pending'` |
| Close abandoned promotion payments | `ProductPromotions.Status` has no `Expired` value | extend the CHECK with `'Expired'` (not a provider result) |
| Report reason analytics | reason code stored inside `Reports.Reason` text | `Reports.ReasonCode varchar(30) NULL` + backfill by parsing |
| Carrier shipping quotes | quote id, carrier, validity are not stored | design with the chosen carrier (e.g. `Orders.ShippingQuoteRef`, `Deliveries.Carrier`) |

## 4. Procedure before any execution

1. Team approval of the option(s) and of the reference data source.
2. Full backup of `UniMarketJava` + `RESTORE VERIFYONLY`.
3. Run on an isolated copy (`database/tests/create_test_copy.sql`), then the full backend test suite.
4. Apply to `UniMarketJava` only after review; record in `dbo.SchemaMigrations`; never re-run V001/V002.
