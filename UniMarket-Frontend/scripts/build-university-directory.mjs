#!/usr/bin/env node
/**
 * Builds src/data/vnHigherEducationDirectory.json from the OFFICIAL list published by the Ministry of Education and
 * Training (Bộ GD&ĐT), Department of Quality Management (Cục Quản lý chất lượng):
 *
 *   "Danh sách các cơ sở giáo dục, chương trình đào tạo giáo dục đại học và cao đẳng sư phạm được công nhận đạt tiêu
 *    chuẩn chất lượng giáo dục (cập nhật đến ngày 30/9/2026)", posted 06/10/2026 on vqa.moet.gov.vn,
 *   archive kdclgd-9_2026.rar → "1__ds-csgd-duoc-cong-nhan-dat-tccl-30-9-2026.docx".
 *
 * Usage (the source files are NOT committed; download and extract them first):
 *   node scripts/build-university-directory.mjs <path to word/document.xml of that .docx> [<sha256 of the .rar>]
 *
 * What it does — and does not do:
 * - Reads the three institution tables: higher-education institutions (domestic standards), pedagogical colleges,
 *   and institutions accredited under foreign standards. Names come ONLY from these tables; nothing is invented.
 * - Normalises abbreviations of the source (ĐH, ĐHQG, CĐSP, KHTN, …) with the fixed rules below; keeps the source
 *   spelling as an alias; extracts the parent system written in brackets (e.g. "(ĐH Đà Nẵng)").
 * - Removes duplicates across tables by an accent-insensitive key.
 * - The source has no province / city column and no common abbreviations; none are added.
 * Coverage limit: only institutions recognised as meeting quality standards are in the source. Institutions without
 * a recognition, new institutions and non-pedagogical colleges are NOT covered — the UI keeps "my school is not listed".
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = {
  publisher: 'Bộ Giáo dục và Đào tạo – Cục Quản lý chất lượng',
  title:
    'Danh sách các cơ sở giáo dục đại học và trường cao đẳng sư phạm được đánh giá, công nhận đạt tiêu chuẩn chất lượng giáo dục',
  page: 'https://vqa.moet.gov.vn/vi/thong-bao-quan-ly-bao-dam/thong-bao/danh-sach-cac-co-so-giao-duc-chuong-trinh-dao-tao-giao-duc-dai-hoc-va-cao-dang-su-pham-duoc-cong-nhan-dat-tieu-chuan-chat-luong-giao-duc-cap-nhat-den-ngay-30-9-2026-95.html',
  file: 'kdclgd-9_2026.rar / 1__ds-csgd-duoc-cong-nhan-dat-tccl-30-9-2026.docx',
  dataUpdatedTo: '2026-09-30',
  publishedAt: '2026-10-06',
  retrievedAt: '2026-11-03',
}

const [, , xmlPath, archiveSha256] = process.argv
if (!xmlPath) {
  console.error('Usage: node scripts/build-university-directory.mjs <word/document.xml> [<sha256 of the archive>]')
  process.exit(1)
}

// ---------------------------------------------------------------- docx tables
const xml = fs.readFileSync(xmlPath, 'utf8')
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const cellText = (frag) => decode([...frag.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).replace(/\s+/g, ' ').trim()
const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((t) =>
  [...t[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => cellText(c[0]))),
)
// Institution tables have "Tên trường" in the header row.
const institutionTables = tables.filter((rows) => rows[0]?.[1] === 'Tên trường')
if (institutionTables.length !== 3) throw new Error(`expected 3 institution tables, found ${institutionTables.length}`)
const [domestic, pedagogy, foreign] = institutionTables.map((rows) => rows.slice(2).map((r) => r[1]).filter(Boolean))

// ---------------------------------------------------------------- normalisation rules (documented, deterministic)
const SYSTEMS = [
  [/ĐHQG\s*(HN|Hà Nội)/g, 'Đại học Quốc gia Hà Nội'],
  [/ĐHQG\s*(TP\.\s*Hồ Chí Minh|TP\.\s*HCM)/g, 'Đại học Quốc gia TP. Hồ Chí Minh'],
]
const ABBREVIATIONS = [
  [/KHXH&NV/g, 'Khoa học Xã hội và Nhân văn'],
  [/\bKHTN\b/g, 'Khoa học Tự nhiên'],
  [/\bCNTT\b/g, 'Công nghệ Thông tin'],
  [/\bTDTT\b/g, 'Thể dục Thể thao'],
  [/CĐSP/g, 'Cao đẳng Sư phạm'],
  [/(^|[\s(])ĐH(?=\s)/g, '$1Đại học'],
  [/TP\.\s*HCM\b/g, 'TP. Hồ Chí Minh'],
]
const SPELLING = [
  [/Hải phòng/g, 'Hải Phòng'],
  [/Bà Rịa Vũng tàu/g, 'Bà Rịa – Vũng Tàu'],
  [/YERSIN/g, 'Yersin'],
  [/Y-\s*Dược/g, 'Y - Dược'],
  [/\s*([–-])\s*/g, ' $1 '],
  [/\s+\)/g, ')'],
  [/(\S)\(/g, '$1 ('],
  [/Khoa học tự nhiên/g, 'Khoa học Tự nhiên'],
]
const PARENT_SYSTEMS = ['Đại học Quốc gia Hà Nội', 'Đại học Quốc gia TP. Hồ Chí Minh', 'Đại học Đà Nẵng', 'Đại học Huế', 'Đại học Thái Nguyên']

export function fold(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalize(sourceName) {
  let name = sourceName.replace(/\s+/g, ' ').trim()
  let formerName = null
  const former = name.match(/\s*\(trước đây là ([^)]+)\)\s*$/i)
  if (former) {
    formerName = former[1].trim()
    name = name.slice(0, former.index).trim()
  }
  for (const [re, to] of [...SYSTEMS, ...ABBREVIATIONS, ...SPELLING]) name = name.replace(re, to)
  name = name.replace(/\s+/g, ' ').trim()
  if (/^Đại học /.test(name) && !PARENT_SYSTEMS.includes(name) && /^Đại học (Bách khoa|Bách Khoa|Kinh tế)/i.test(name)) {
    // Source writes some "Đại học X" without "Trường"; keep it as written (e.g. "Đại học Kinh tế TP. Hồ Chí Minh").
  }
  let system = null
  for (const parent of PARENT_SYSTEMS) {
    const bracket = name.match(new RegExp(`\\s*\\(${parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)$`))
    const dash = name.match(new RegExp(`\\s*[–-]\\s*${parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    const hit = bracket ?? dash
    if (hit) {
      system = parent
      name = `${name.slice(0, hit.index).trim()} – ${parent}`
      break
    }
  }
  if (formerName) for (const [re, to] of [...ABBREVIATIONS, ...SPELLING]) formerName = formerName.replace(re, to)
  return { name, system, formerName }
}

function typeOf(name) {
  if (/^Học viện\b/.test(name)) return 'ACADEMY'
  if (/^Trường Cao đẳng\b/.test(name)) return 'PEDAGOGICAL_COLLEGE'
  return 'UNIVERSITY'
}

// ---------------------------------------------------------------- build
const byKey = new Map()
const duplicates = []
function add(sourceName, list) {
  const { name, system, formerName } = normalize(sourceName)
  const key = fold(name.replace(/^Trường /, ''))
  const existing = byKey.get(key)
  if (existing) {
    duplicates.push({ sourceName, mergedInto: existing.name })
    if (!existing.sources.includes(list)) existing.sources.push(list)
    if (!existing.aliases.includes(sourceName) && sourceName !== existing.name) existing.aliases.push(sourceName)
    return
  }
  const aliases = []
  if (sourceName !== name) aliases.push(sourceName)
  if (formerName) aliases.push(formerName)
  const acronym = sourceName.match(/\(([A-Z]{2,6})\)/)
  if (acronym) aliases.push(acronym[1])
  byKey.set(key, { id: key.replace(/ /g, '-'), name, type: typeOf(name), system, aliases, sources: [list] })
}
domestic.forEach((n) => add(n, 'DOMESTIC_STANDARD'))
pedagogy.forEach((n) => add(n, 'DOMESTIC_STANDARD_PEDAGOGICAL_COLLEGE'))
foreign.forEach((n) => add(n, 'FOREIGN_STANDARD'))

const institutions = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
const ids = new Set(institutions.map((i) => i.id))
if (ids.size !== institutions.length) throw new Error('duplicate ids')

const directory = {
  version: '2026-09-30.1',
  source: { ...SOURCE, archiveSha256: archiveSha256 ?? null },
  counts: {
    sourceRows: { domesticStandard: domestic.length, pedagogicalColleges: pedagogy.length, foreignStandard: foreign.length },
    duplicatesMerged: duplicates.length,
    institutions: institutions.length,
    byType: institutions.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] ?? 0) + 1 }), {}),
  },
  coverageNote:
    'Only institutions recognised as meeting education quality standards (domestic or foreign standards) and accredited pedagogical colleges, as listed by the Ministry on 30/9/2026. Institutions without such a recognition, newly founded institutions and non-pedagogical colleges are not included. Province / city and common abbreviations are not part of the source and are not included.',
  normalisation: [
    'ĐHQG HN / ĐHQG Hà Nội → Đại học Quốc gia Hà Nội; ĐHQG TP. HCM / ĐHQG TP. Hồ Chí Minh → Đại học Quốc gia TP. Hồ Chí Minh',
    'ĐH → Đại học; CĐSP → Cao đẳng Sư phạm; KHXH&NV, KHTN, CNTT, TDTT written out; TP. HCM → TP. Hồ Chí Minh',
    '"(Đại học Đà Nẵng)", "- ĐHQG Hà Nội" … → "– <system>" and system field (ĐHQG HN, ĐHQG TP.HCM, ĐH Đà Nẵng, ĐH Huế, ĐH Thái Nguyên)',
    '"(trước đây là …)" → former name kept as alias',
    'spacing / capitalisation fixes only (Hải Phòng, Vũng Tàu, Yersin, Y - Dược, Khoa học Tự nhiên)',
    'the source spelling is always kept as an alias; duplicates across tables merged by an accent-insensitive key',
  ],
  institutions,
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'vnHigherEducationDirectory.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(directory, null, 1) + '\n')
console.log(JSON.stringify(directory.counts))
console.log('duplicates merged:', duplicates.map((d) => `${d.sourceName} → ${d.mergedInto}`).join(' | '))
console.log('written', out)
