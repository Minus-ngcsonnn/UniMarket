/**
 * Backend category slugs (derived from dbo.Categories.Name, see PRODUCTS_API.md) that mean the same as a design
 * category slug (constants/categories.js). Plain data, no React, so services and Node checks can import it.
 */
export const CATEGORY_SLUG_ALIASES = {
  textbooks: ['textbooks'],
  electronics: ['electronics'],
  'dorm-items': ['dormitory-items'],
  fashion: ['fashion'],
  'study-gear': ['study-equipment'],
}

/** Frontend slug for a backend category slug (e.g. dormitory-items → dorm-items); unknown slugs are kept. */
export function frontendCategorySlug(apiSlug) {
  const match = Object.entries(CATEGORY_SLUG_ALIASES).find(([slug, aliases]) => slug === apiSlug || aliases.includes(apiSlug))
  return match ? match[0] : apiSlug
}
