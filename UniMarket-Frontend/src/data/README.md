# Higher-education directory (`vnHigherEducationDirectory.json`)

Used by the registration form (`components/auth/UniversityPicker.jsx`) so students can search their university,
academy or pedagogical college with or without Vietnamese accents.

## Source

- Publisher: Bộ Giáo dục và Đào tạo (Ministry of Education and Training) – Cục Quản lý chất lượng.
- Document: "Danh sách các cơ sở giáo dục đại học và trường cao đẳng sư phạm được đánh giá, công nhận đạt tiêu chuẩn
  chất lượng giáo dục", data updated to **30/9/2026**, posted 06/10/2026:
  https://vqa.moet.gov.vn/vi/thong-bao-quan-ly-bao-dam/thong-bao/danh-sach-cac-co-so-giao-duc-chuong-trinh-dao-tao-giao-duc-dai-hoc-va-cao-dang-su-pham-duoc-cong-nhan-dat-tieu-chuan-chat-luong-giao-duc-cap-nhat-den-ngay-30-9-2026-95.html
- File: `kdclgd-9_2026.rar` → `1__ds-csgd-duoc-cong-nhan-dat-tccl-30-9-2026.docx` (archive SHA-256 recorded in the JSON).
- Retrieved 2026-11-03.

## Coverage

230 institutions after merging 9 duplicates: 204 universities, 14 academies, 12 pedagogical colleges
(source rows: 210 institutions under domestic standards, 12 pedagogical colleges, 17 under foreign standards).

Not covered, because the source only lists institutions **recognised as meeting quality standards**: institutions
without such a recognition, newly founded ones, and all non-pedagogical colleges. The source has no province / city and
no common abbreviations (NEU, HUST, UEH …), so none are included; only the Ministry's own spelling (e.g. "ĐH …"), the
former name it states (Intracom ← Chu Văn An) and the acronym it prints (BUV) are aliases. The form always offers
"My university is not listed".

Choosing an institution submits its canonical name as `universityName`, stored as **self-declared**. It is not a
student verification and does not create `Universities` / `Campuses` rows. Official UniMarket campuses
(`GET /api/campuses`) are offered separately and submitted as `campusId`.

## Rebuild

1. Download the archive from the page above and extract the `.docx`; extract `word/document.xml` from it (a `.docx` is a
   zip file).
2. `node scripts/build-university-directory.mjs <path>/word/document.xml <sha256 of the archive>`

The normalisation rules (ĐH → Đại học, ĐHQG HN → Đại học Quốc gia Hà Nội, parent system extraction, …) are listed in
the script and in the JSON (`normalisation`). For a newer list, repeat with the new file and update `version`.
