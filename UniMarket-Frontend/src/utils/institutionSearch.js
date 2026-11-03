/**
 * Accent-insensitive search over the higher-education directory (src/data/vnHigherEducationDirectory.json)
 * and the official UniMarket campuses. Pure functions, no network.
 *
 * - "dai hoc can tho", "Đại học Cần Thơ", "ĐH Cần Thơ" and "dh can tho" all match.
 * - Every word of the query must appear (in any order) in the name, an alias (incl. the Ministry's spelling) or the
 *   parent system ("Đại học Huế" finds its member schools).
 * - A few generic shorthands are expanded (hcm, tphcm, hn, dhqg, dh, hv, cdsp). No school-specific acronym is invented.
 */

/** Lower-case ASCII form: accents removed, đ → d, punctuation → space. */
export function foldText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SHORTHANDS = {
  tphcm: 'tp ho chi minh',
  hcm: 'ho chi minh',
  hcmc: 'ho chi minh',
  hn: 'ha noi',
  dhqg: 'dai hoc quoc gia',
  dh: 'dai hoc',
  hv: 'hoc vien',
  cdsp: 'cao dang su pham',
}

/** Query words after folding and shorthand expansion. */
export function queryWords(query) {
  return foldText(query)
    .split(' ')
    .filter(Boolean)
    .flatMap((word) => (SHORTHANDS[word] ?? word).split(' '))
}

/**
 * @param {{ id: string, name: string, aliases?: string[], system?: string|null }[]} entries
 * @returns {object[]} entries with a precomputed `_haystack` and `_name` (folded)
 */
export function buildIndex(entries) {
  return entries.map((entry) => {
    const name = foldText(entry.name)
    return {
      ...entry,
      _name: name,
      _haystack: ` ${[name, ...(entry.aliases ?? []).map(foldText), foldText(entry.system ?? '')].join(' ')} `,
    }
  })
}

/**
 * @param {object[]} index from buildIndex
 * @param {string} query
 * @param {number} [limit]
 * @returns {object[]} best matches first; empty query → empty list
 */
export function searchIndex(index, query, limit = 50) {
  const words = queryWords(query)
  if (words.length === 0) return []
  const phrase = words.join(' ')
  const scored = []
  for (const entry of index) {
    if (!words.every((word) => entry._haystack.includes(word))) continue
    let score = 0
    const shortName = entry._name.replace(/^truong /, '')
    if (shortName.startsWith(phrase) || entry._name.startsWith(phrase)) score += 100
    if (entry._name.includes(phrase)) score += 40
    score += words.filter((word) => entry._haystack.includes(` ${word}`)).length * 5 // word-start matches
    score -= entry._name.length / 100 // shorter names first on ties
    scored.push([score, entry])
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'vi'))
    .slice(0, limit)
    .map(([, entry]) => entry)
}
