import { ArmchairIcon, BookOpenIcon, LaptopIcon, PencilRulerIcon, ShirtIcon } from '../components/icons'

/**
 * Marketplace categories as shown in the Figma design (homepage and catalog filters).
 * Static UI data for now. Replace with the backend category list once the database and API exist.
 */
export const CATEGORIES = [
  { slug: 'textbooks', name: 'Textbooks', tagline: 'Less spend, more knowledge', Icon: BookOpenIcon },
  { slug: 'electronics', name: 'Electronics', tagline: 'Upgrade your everyday', Icon: LaptopIcon },
  { slug: 'dorm-items', name: 'Dorm items', tagline: 'Make your space yours', Icon: ArmchairIcon },
  { slug: 'fashion', name: 'Fashion', tagline: 'Fresh looks, smaller prices', Icon: ShirtIcon },
  { slug: 'study-gear', name: 'Study gear', tagline: 'Ready for your next A', Icon: PencilRulerIcon },
]
