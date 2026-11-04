import { formatPrice } from '../../../utils/format'

/** Backend page { items, page, size, totalItems } → the list shape of useAdminList / DataTable. */
export const toAdminPage = (data) => ({ items: data.items, total: data.totalItems, page: data.page, pageSize: data.size })

/** Money exactly as the server returned it. */
export const money = (value) => (value == null ? '—' : formatPrice(value))
