import { useId, useRef, useState } from 'react'
import ActiveFilterChips from '../../components/catalog/ActiveFilterChips'
import ProductFilters from '../../components/catalog/ProductFilters'
import { BadgeCheckIcon, SlidersIcon, XIcon } from '../../components/icons'
import Breadcrumbs from '../../components/layout/Breadcrumbs'
import PageContainer from '../../components/layout/PageContainer'
import ProductGrid from '../../components/product/ProductGrid'
import SafetyNote from '../../components/product/SafetyNote'
import SampleDataNotice from '../../components/product/SampleDataNotice'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import Select from '../../components/ui/Select'
import { CATALOG_PAGE_SIZE, SORT_OPTIONS } from '../../constants/product'
import useAsyncData from '../../hooks/useAsyncData'
import useCatalogParams from '../../hooks/useCatalogParams'
import { PATHS } from '../../routes/paths'
import { productService } from '../../services/products/productService'

/**
 * Product Catalog ("Explore marketplace") following the Figma catalog screen:
 * breadcrumb, title, filter sidebar, result count + sort, active filter chips, 3-column grid, pagination.
 * Below lg the filters open in a drawer.
 */
export default function CatalogPage() {
  const { filters, update, clearAll } = useCatalogParams()
  const { data, previousData, error, isLoading, reload } = useAsyncData(
    () => productService.listProducts({ ...filters, pageSize: CATALOG_PAGE_SIZE }),
    JSON.stringify(filters),
  )
  const [isSidebarHidden, setIsSidebarHidden] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const resultsRef = useRef(null)
  const drawerTitleId = useId()

  const result = data ?? previousData // keep showing previous results while new ones load
  const facets = result?.facets
  const total = result?.total ?? 0
  const activeFilterCount =
    (filters.category ? 1 : 0) + filters.conditions.length + filters.campuses.length + (filters.minPrice != null || filters.maxPrice != null ? 1 : 0)

  function changePage(page) {
    update({ page })
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  let content
  if (error) {
    content = <ErrorState title="Couldn’t load listings" message={error.message} onRetry={reload} />
  } else if (!result) {
    content = <ProductGrid isLoading layout={isSidebarHidden ? 'wide' : 'catalog'} skeletonCount={6} />
  } else if (result.items.length === 0) {
    content = (
      <EmptyState
        title="No items match your filters"
        description="Try a different search, widen the price range or remove some filters."
        action={
          <Button variant="secondary" onClick={clearAll}>
            Clear all filters
          </Button>
        }
      />
    )
  } else {
    content = (
      <div className={`flex flex-col gap-8 transition-opacity ${isLoading ? 'opacity-60' : ''}`} aria-busy={isLoading}>
        <ProductGrid products={result.items} layout={isSidebarHidden ? 'wide' : 'catalog'} label="Products" />
        <Pagination page={filters.page} pageSize={CATALOG_PAGE_SIZE} total={total} onPageChange={changePage} />
      </div>
    )
  }

  return (
    <PageContainer className="py-6 sm:py-8">
      <title>Explore marketplace · UniMarket</title>

      <Breadcrumbs items={[{ label: 'Home', to: PATHS.home }, { label: 'Explore marketplace' }]} />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[2rem]">Good finds. Right on campus.</h1>
          <p className="mt-1.5 text-ink-muted">Textbooks, tech, and everything in between. Find your next favorite for less.</p>
        </div>
        <p className="hidden items-center gap-2 rounded-control bg-primary-soft px-4 py-2.5 text-sm font-medium text-primary sm:inline-flex">
          <BadgeCheckIcon className="size-4.5" />
          From students, for students
        </p>
      </header>

      <SampleDataNotice className="mt-5" />

      <div className={`mt-6 grid items-start gap-8 ${isSidebarHidden ? '' : 'lg:grid-cols-[15.5rem_minmax(0,1fr)]'}`}>
        {!isSidebarHidden && (
          <div className="hidden flex-col gap-4 lg:flex">
            <ProductFilters filters={filters} facets={facets} onChange={update} onCollapse={() => setIsSidebarHidden(true)} />
            <SafetyNote />
          </div>
        )}

        <section ref={resultsRef} aria-labelledby="results-title" className="flex scroll-mt-28 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-title" aria-live="polite" className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-ink">
                {result ? `${total} ${total === 1 ? 'item' : 'items'}` : 'Loading…'}
              </span>
              {result && <span className="text-sm text-ink-muted">{filters.q ? `for “${filters.q}”` : 'on your campus'}</span>}
            </h2>

            <div className="flex items-center gap-2">
              {/* Below lg (or when the sidebar is hidden) filters open in a drawer */}
              <div className={isSidebarHidden ? '' : 'lg:hidden'}>
                <Button
                  variant="secondary"
                  onClick={() => setIsDrawerOpen(true)}
                  aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : 'Filters'}
                >
                  <SlidersIcon className="size-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">{activeFilterCount}</span>
                  )}
                </Button>
              </div>
              {isSidebarHidden && (
                <div className="hidden lg:block">
                  <Button variant="ghost" onClick={() => setIsSidebarHidden(false)}>
                    Show sidebar
                  </Button>
                </div>
              )}
              <span className="hidden text-sm text-ink-muted sm:inline" aria-hidden="true">
                Sort by
              </span>
              <Select
                label="Sort by"
                hideLabel
                options={SORT_OPTIONS}
                value={filters.sort}
                onChange={(sort) => update({ sort })}
                className="w-44 sm:w-52"
              />
            </div>
          </div>

          <ActiveFilterChips filters={filters} onChange={update} onClearAll={clearAll} />

          {content}
        </section>
      </div>

      {isDrawerOpen && (
        <Modal variant="drawer" labelledBy={drawerTitleId} onClose={() => setIsDrawerOpen(false)}>
          <div className="flex min-h-full flex-col">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p id={drawerTitleId} className="text-base font-semibold text-ink">
                Filter listings
              </p>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close filters"
                className="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <div className="flex-1 px-5 py-5">
              <ProductFilters filters={filters} facets={facets} onChange={update} bare />
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface px-5 py-4">
              <Button variant="secondary" onClick={clearAll} className="flex-1">
                Clear all
              </Button>
              <Button onClick={() => setIsDrawerOpen(false)} className="flex-1">
                Show {total} {total === 1 ? 'item' : 'items'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  )
}
