import ProductCard from './ProductCard'
import ProductCardSkeleton from './ProductCardSkeleton'

const LAYOUTS = {
  catalog: 'grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3', // next to the filter sidebar (Figma: 3 columns)
  wide: 'grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4', // full-width rows (homepage, related items)
}

/**
 * Responsive grid of product cards, with loading placeholders.
 * Empty and error states are handled by the parent, which knows the context.
 *
 * @param {'catalog'|'wide'} [layout]
 * @param {number} [skeletonCount] placeholders shown while loading
 */
export default function ProductGrid({ products = [], isLoading = false, layout = 'catalog', skeletonCount = 6, label }) {
  if (isLoading) {
    return (
      <ul className={`grid ${LAYOUTS[layout]}`} aria-busy="true" aria-label={label ? `Loading ${label}` : 'Loading products'}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <li key={index}>
            <ProductCardSkeleton animated />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className={`grid ${LAYOUTS[layout]}`} aria-label={label}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}
