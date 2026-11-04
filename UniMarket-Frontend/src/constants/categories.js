import { CATEGORY_SLUG_ALIASES, frontendCategorySlug } from './categorySlugs'
import { ArmchairIcon, BookOpenIcon, LaptopIcon, PencilRulerIcon, ShirtIcon } from '../components/icons'

/**
 * Marketplace categories as shown in the Figma design (homepage and catalog filters): icons, taglines and photos.
 * With the real API (Stage 6.2) the list itself comes from GET /api/categories (services/products/catalogReference.js);
 * these entries add the design assets. `apiSlugs` are the backend slugs (derived from dbo.Categories.Name) that mean the
 * same category, so homepage links such as ?category=dorm-items keep working.
 */
export const CATEGORIES = [
  { slug: 'textbooks', name: 'Textbooks', tagline: 'Less spend, more knowledge', Icon: BookOpenIcon, apiSlugs: CATEGORY_SLUG_ALIASES['textbooks'] },
  { slug: 'electronics', name: 'Electronics', tagline: 'Upgrade your everyday', Icon: LaptopIcon, apiSlugs: CATEGORY_SLUG_ALIASES['electronics'] },
  { slug: 'dorm-items', name: 'Dorm items', tagline: 'Make your space yours', Icon: ArmchairIcon, apiSlugs: CATEGORY_SLUG_ALIASES['dorm-items'] },
  { slug: 'fashion', name: 'Fashion', tagline: 'Fresh looks, smaller prices', Icon: ShirtIcon, apiSlugs: CATEGORY_SLUG_ALIASES['fashion'] },
  { slug: 'study-gear', name: 'Study gear', tagline: 'Ready for your next A', Icon: PencilRulerIcon, apiSlugs: CATEGORY_SLUG_ALIASES['study-gear'] },
]

export { frontendCategorySlug }
