/**
 * SAMPLE DATA FOR FRONTEND DEVELOPMENT ONLY.
 * Product photos are cropped from the UniMarket Figma catalog design. Sellers and prices are illustrative.
 * Used only when USE_MOCK_DATA is true (see src/config/dataSource.js).
 */
import calculusTextbook from './images/calculus-textbook.jpg'
import deskLamp from './images/desk-lamp.jpg'
import graphingCalculator from './images/graphing-calculator.jpg'
import herschelBackpack from './images/herschel-backpack.jpg'
import macbookAir from './images/macbook-air.jpg'
import miniFridge from './images/mini-fridge.jpg'
import nikeSneakers from './images/nike-sneakers.jpg'
import organicChemistry from './images/organic-chemistry.jpg'
import sonyHeadphones from './images/sony-headphones.jpg'

/** The signed-in student in sample data (there is no real sign-in yet). */
export const MOCK_CURRENT_USER_ID = 'u-demo'

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

export const MOCK_SELLERS = {
  'u-minh': { id: 'u-minh', name: 'Minh Nguyen', verified: true, campus: 'HANOI', programme: 'Software Engineering · Year 2', memberSince: '2025-09-05' },
  'u-linh': { id: 'u-linh', name: 'Linh Tran', verified: true, campus: 'HANOI', programme: 'Graphic Design · Year 3', memberSince: '2024-09-10' },
  'u-duc': { id: 'u-duc', name: 'Duc Pham', verified: true, campus: 'HANOI', programme: 'Business Administration · Year 1', memberSince: '2026-09-01' },
  'u-anh': { id: 'u-anh', name: 'Anh Le', verified: false, campus: 'HCMC', programme: 'Information Assurance · Year 2', memberSince: '2025-10-12' },
  'u-huy': { id: 'u-huy', name: 'Huy Do', verified: true, campus: 'DA_NANG', programme: 'Artificial Intelligence · Year 4', memberSince: '2023-09-15' },
  'u-mai': { id: 'u-mai', name: 'Mai Vo', verified: true, campus: 'HANOI', programme: 'Digital Marketing · Year 2', memberSince: '2025-09-08' },
  [MOCK_CURRENT_USER_ID]: { id: MOCK_CURRENT_USER_ID, name: 'Demo Student', verified: true, campus: 'HANOI', programme: 'Information Systems · Year 3', memberSince: '2024-09-01' },
}

export const MOCK_PRODUCTS = [
  {
    id: 2048,
    title: 'Calculus: Early Transcendentals, 9e',
    description:
      'James Stewart, 9th edition. Used for MAE101 and MAE102. Clean pages with no highlighting, light wear on the corners of the cover. Includes the original index card of formulas.',
    price: 450_000,
    originalPrice: 1_350_000,
    condition: 'LIKE_NEW',
    status: 'AVAILABLE',
    categorySlug: 'textbooks',
    campus: 'HANOI',
    images: [calculusTextbook],
    sellerId: 'u-minh',
    featured: true,
    createdAt: minutesAgo(12),
  },
  {
    id: 2047,
    title: 'Sony WH-1000XM4 headphones',
    description:
      'Noise-cancelling over-ear headphones, black. Battery still lasts around 25 hours. Comes with the case, USB-C cable and audio cable. Ear pads replaced last month.',
    price: 3_200_000,
    originalPrice: 6_490_000,
    condition: 'LIKE_NEW',
    status: 'AVAILABLE',
    categorySlug: 'electronics',
    campus: 'HANOI',
    images: [sonyHeadphones],
    sellerId: 'u-linh',
    featured: true,
    createdAt: minutesAgo(28),
  },
  {
    id: 2046,
    title: 'Compact mini fridge · 90 L',
    description:
      'Perfect for a dorm room. Quiet, cools well and has a small freezer compartment. A few small scratches on the side, fully working. Must be collected from the dormitory area.',
    price: 1_500_000,
    originalPrice: 3_290_000,
    condition: 'USED',
    status: 'AVAILABLE',
    categorySlug: 'dorm-items',
    campus: 'HANOI',
    images: [miniFridge],
    sellerId: 'u-duc',
    featured: true,
    createdAt: minutesAgo(42),
  },
  {
    id: 2045,
    title: 'Nike Air Force 1 · Size 42',
    description: 'White leather, worn a handful of times. Cleaned and ready to wear. Original box not included.',
    price: 1_100_000,
    originalPrice: 2_929_000,
    condition: 'LIKE_NEW',
    status: 'AVAILABLE',
    categorySlug: 'fashion',
    campus: 'HCMC',
    images: [nikeSneakers],
    sellerId: 'u-anh',
    featured: true,
    createdAt: minutesAgo(60),
  },
  {
    id: 2044,
    title: 'TI-84 Plus CE graphing calculator',
    description: 'Rechargeable, black. Charging cable included. Allowed in most maths exams. Screen has no scratches.',
    price: 1_400_000,
    originalPrice: null,
    condition: 'LIKE_NEW',
    status: 'AVAILABLE',
    categorySlug: 'study-gear',
    campus: 'HANOI',
    images: [graphingCalculator],
    sellerId: MOCK_CURRENT_USER_ID,
    featured: false,
    createdAt: minutesAgo(2 * 60),
  },
  {
    id: 2043,
    title: 'Adjustable LED desk lamp',
    description: 'Sage green, three brightness levels, adjustable arm. Bought this semester, moving out so it has to go.',
    price: 250_000,
    originalPrice: null,
    condition: 'NEW',
    status: 'RESERVED',
    categorySlug: 'dorm-items',
    campus: 'HANOI',
    images: [deskLamp],
    sellerId: MOCK_CURRENT_USER_ID,
    featured: false,
    createdAt: minutesAgo(3 * 60),
  },
  {
    id: 2042,
    title: 'Herschel Classic backpack · Sage',
    description: 'Fits a 15-inch laptop. Front pocket with key clip. Very good condition, no stains.',
    price: 650_000,
    originalPrice: 1_590_000,
    condition: 'LIKE_NEW',
    status: 'AVAILABLE',
    categorySlug: 'fashion',
    campus: 'DA_NANG',
    images: [herschelBackpack],
    sellerId: 'u-huy',
    featured: false,
    createdAt: minutesAgo(4 * 60),
  },
  {
    id: 2041,
    title: 'Organic Chemistry, 4th edition',
    description: 'Paula Yurkanis Bruice. Some notes in pencil in the first three chapters, otherwise good.',
    price: 380_000,
    originalPrice: null,
    condition: 'USED',
    status: 'SOLD',
    categorySlug: 'textbooks',
    campus: 'HANOI',
    images: [organicChemistry],
    sellerId: MOCK_CURRENT_USER_ID,
    featured: false,
    createdAt: minutesAgo(5 * 60),
  },
  {
    id: 2040,
    title: 'MacBook Air M1 · 8GB / 256GB',
    description:
      'Space grey, battery health 89%. Used for one year of coursework. Comes with the original charger. No dents, keyboard and screen in excellent condition.',
    price: 9_800_000,
    originalPrice: 18_990_000,
    condition: 'LIKE_NEW',
    status: 'AVAILABLE',
    categorySlug: 'electronics',
    campus: 'HANOI',
    images: [macbookAir],
    sellerId: 'u-minh',
    featured: false,
    createdAt: minutesAgo(6 * 60),
  },
]
