#!/usr/bin/env node
/**
 * Generates the demo listing illustrations referenced by the V001 seed data
 * (dbo.ProductImages.ImageUrl = 'images/demo/products/item-NN-front.svg' | 'item-NN-detail.svg').
 *
 * The original demo assets were never committed, so every seeded listing showed a broken image. These files are
 * clearly labelled ILLUSTRATIONS ("Ảnh minh họa demo — không phải ảnh chụp thật"): they must never be presented as
 * real photos of the items. Titles, categories and conditions are read from the V001 seed script, so each listing gets
 * its own pair of images (front = SortOrder 0, detail = SortOrder 1).
 *
 * Output: public/images/demo/products/*.svg (static, no scripts, no external references), served by the frontend as
 * /images/demo/products/... (the backend returns these references root-relative, see ProductMapper.publicUrl).
 *
 * Usage (from UniMarket-Frontend): node scripts/generate-demo-product-images.mjs
 * Deterministic: running it again produces identical files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SEED = path.resolve(here, '../../database/baseline/V001__UniMarket_BusinessAligned.sql')
const OUT = path.resolve(here, '../public/images/demo/products')

const CATEGORIES = {
  Textbooks: { label: 'Giáo trình', bg: '#edf3ff', accent: '#2459e0', soft: '#c9d8fb', icon: 'book' },
  Electronics: { label: 'Điện tử', bg: '#eef6f4', accent: '#0f766e', soft: '#c3e3dc', icon: 'laptop' },
  'Dormitory items': { label: 'Đồ ký túc xá', bg: '#fdf4e7', accent: '#b45309', soft: '#f5d9b0', icon: 'lamp' },
  Fashion: { label: 'Thời trang', bg: '#fbeff4', accent: '#be185d', soft: '#f3c9da', icon: 'shirt' },
  'Study equipment': { label: 'Dụng cụ học tập', bg: '#f3f0fd', accent: '#6d28d9', soft: '#d9cdf7', icon: 'pencil' },
}
const CONDITIONS = { New: 'Mới', 'Like New': 'Như mới', Used: 'Đã qua sử dụng' }

const escapeXml = (text) => text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

/** Splits a title into at most two lines of about `max` characters (word boundaries, ellipsis when cut). */
function wrap(title, max = 22) {
  const lines = ['']
  for (const word of title.split(/\s+/)) {
    const current = lines[lines.length - 1]
    if (!current) lines[lines.length - 1] = word
    else if ((current + ' ' + word).length <= max) lines[lines.length - 1] = current + ' ' + word
    else if (lines.length < 2) lines.push(word)
    else { lines[1] = (lines[1] + ' ' + word).slice(0, max - 1).trimEnd() + '…'; break }
  }
  return lines
}

/** Simple line-art icon per category, drawn in a 200 x 200 box. */
function icon(kind, accent, soft) {
  // Each element gets exactly one fill and one stroke-width (duplicate attributes make the whole SVG invalid XML).
  const line = (width = 8) => `stroke="${accent}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
  const shape = (fill, width = 8) => `fill="${fill}" ${line(width)}`
  const path = (width = 8) => `fill="none" ${line(width)}`
  switch (kind) {
    case 'book':
      return `<rect x="30" y="120" width="140" height="34" rx="6" ${shape(soft)}/>
  <rect x="44" y="80" width="120" height="34" rx="6" ${shape('#fff')}/>
  <rect x="36" y="40" width="128" height="34" rx="6" ${shape(soft)}/>
  <path d="M58 57h60M66 97h60M52 137h70" ${path(6)}/>`
    case 'laptop':
      return `<rect x="44" y="44" width="112" height="78" rx="8" ${shape('#fff')}/>
  <rect x="58" y="58" width="84" height="50" rx="3" fill="${soft}"/>
  <path d="M24 146h152l-14 20H38z" ${shape(soft)}/>`
    case 'lamp':
      return `<path d="M64 36h72l22 58H42z" ${shape(soft)}/>
  <path d="M100 94v62M64 166h72" ${path()}/>
  <circle cx="100" cy="112" r="7" fill="${accent}"/>`
    case 'shirt':
      return `<path d="M72 34l-46 26 18 34 20-10v82h72V84l20 10 18-34-46-26c-4 14-16 22-28 22s-24-8-28-22z" ${shape(soft)}/>`
    default:
      return `<path d="M50 150l86-86 22 22-86 86H50z" ${shape(soft)}/>
  <path d="M124 76l22 22M50 150l22 22" ${path()}/>
  <rect x="34" y="28" width="132" height="26" rx="5" ${shape('#fff', 6)}/>
  <path d="M56 28v12M78 28v8M100 28v12M122 28v8M144 28v12" ${path(5)}/>`
  }
}

function svg({ n, title, category, condition, variant }) {
  const c = CATEGORIES[category]
  if (!c) throw new Error(`Unknown category ${category} for item ${n}`)
  const lines = wrap(title)
  const isFront = variant === 'front'
  // Small, deterministic variation so neighbouring listings look different.
  const tilt = ((n * 37) % 15) - 7
  const iconBlock = isFront
    ? `<g transform="translate(300 92) rotate(${tilt} 100 100)">${icon(c.icon, c.accent, c.soft)}</g>`
    : `<circle cx="400" cy="200" r="132" fill="#fff" stroke="${c.soft}" stroke-width="10"/>
  <g transform="translate(400 200) scale(1.5) translate(-100 -100) rotate(${tilt} 100 100)">${icon(c.icon, c.accent, c.soft)}</g>
  <path d="M497 297l52 52" stroke="${c.accent}" stroke-width="16" stroke-linecap="round"/>`
  const titleY = isFront ? 358 : 392
  const titleText = lines
    .map((line, i) => `<text x="400" y="${titleY + i * 46}" text-anchor="middle" font-size="38" font-weight="700" fill="#18243b">${escapeXml(line)}</text>`)
    .join('\n  ')
  const chip = isFront
    ? `${escapeXml(c.label)} · ${escapeXml(CONDITIONS[condition] ?? condition)}`
    : `${escapeXml(c.label)} · Ảnh chi tiết (2/2)`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="Ảnh minh họa demo: ${escapeXml(title)}">
  <title>Ảnh minh họa demo (không phải ảnh chụp thật): ${escapeXml(title)}</title>
  <rect width="800" height="600" fill="${c.bg}"/>
  <circle cx="${120 + ((n * 53) % 560)}" cy="${isFront ? 80 : 520}" r="${70 + ((n * 17) % 40)}" fill="${c.soft}" opacity="0.45"/>
  <rect x="236" y="28" width="328" height="40" rx="20" fill="#fff" stroke="${c.soft}" stroke-width="2"/>
  <text x="400" y="55" text-anchor="middle" font-size="19" font-weight="600" fill="${c.accent}">Ảnh minh họa demo</text>
  ${iconBlock}
  ${titleText}
  <text x="400" y="${titleY + lines.length * 46 + 8}" text-anchor="middle" font-size="22" fill="#5d6879">${chip}</text>
  <text x="400" y="578" text-anchor="middle" font-size="16" fill="#5d6879">Không phải ảnh chụp thật của sản phẩm · Demo illustration, not a real photo</text>
</svg>
`.replace('<svg ', '<svg font-family="Inter, \'Segoe UI\', Roboto, Arial, sans-serif" ')
}

// ---------------------------------------------------------------- read the seed
const seed = fs.readFileSync(SEED, 'utf8')
const products = []
const productLine = /INSERT dbo\.Products\(SellerId,CategoryId,CampusId,Title,[^\n]*?@Campus,N'((?:[^']|'')+)',N'(?:[^']|'')*','(New|Like New|Used)',[^\n]*?c\.Name=N'([^']+)';\s*\r?\nSET @pid=SCOPE_IDENTITY\(\); INSERT @Products VALUES\((\d+),@pid\);/g
for (const m of seed.matchAll(productLine)) {
  products.push({ n: Number(m[4]), title: m[1].replace(/''/g, "'"), condition: m[2], category: m[3] })
}
const referenced = [...seed.matchAll(/N'images\/demo\/products\/(item-(\d{2})-(front|detail)\.svg)'/g)].map((m) => ({ file: m[1], n: Number(m[2]), variant: m[3] }))
if (products.length !== 50 || referenced.length !== 100) {
  throw new Error(`Seed parse mismatch: ${products.length} products, ${referenced.length} image references (expected 50 / 100)`)
}

fs.mkdirSync(OUT, { recursive: true })
const byNumber = new Map(products.map((p) => [p.n, p]))
for (const ref of referenced) {
  const product = byNumber.get(ref.n)
  if (!product) throw new Error(`No seeded product ${ref.n} for ${ref.file}`)
  fs.writeFileSync(path.join(OUT, ref.file), svg({ ...product, variant: ref.variant }))
}
console.log(`Wrote ${referenced.length} demo illustrations for ${products.length} listings to ${path.relative(process.cwd(), OUT)}`)
