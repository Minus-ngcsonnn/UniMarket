import { INITIAL_REFERENCE, loadCatalogReference } from '../services/products/catalogReference'
import useAsyncData from './useAsyncData'

/**
 * Categories, campuses and pickup areas for filters and forms (see services/products/catalogReference.js).
 * Until the real lists arrive, `reference` holds the design categories so links and labels render at once.
 * @returns {{ reference: object, isLoading: boolean, error: Error|null, reload: () => void }}
 */
export default function useCatalogReference() {
  const { data, error, isLoading, reload } = useAsyncData(loadCatalogReference, 'catalog-reference')
  return { reference: data ?? INITIAL_REFERENCE, isLoading, error, reload }
}
