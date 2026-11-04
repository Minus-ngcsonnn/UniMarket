/**
 * Backend order JSON (docs/ORDERS_API.md, OrderResponse) → the order shape the order pages use (same fields as the
 * sample data in src/mocks/mockOrderApi.js), plus the real-only fields. Money and deadlines come from the server and
 * are never recalculated here.
 *
 * {
 *   id, code, status, role ('buyer' | 'seller' | 'admin'), buyer: { id, name }, seller: { id, name },
 *   items: [{ productId, title, image, price, quantity }],   // title / price = snapshots taken at checkout
 *   amount,                       // total the buyer pays (subtotal + shipping fee)
 *   amounts: { subtotal, shippingFee, total, commissionRate?, commission?, sellerProceeds?, sellerPayout? },
 *   shipping: { source: 'SIMULATED_QUOTE' | 'LEGACY', carrier?, label?, distanceKm?, fee, pickupZone?, deliveryZone? },
 *   delivery,                     // { fullName, phone, address } or null (seller: only while PAID / DELIVERING)
 *   paymentMethod, confirmBy, paymentDueAt, createdAt, timeline: [{ status, at, by?, note? }],
 *   actions: ['CONFIRM', 'CANCEL', 'PAY', 'CONTINUE_PAYMENT', 'SHIP', 'CONFIRM_RECEIPT', 'OPEN_DISPUTE'],
 *   payments, shipment, cancellationReason, disputes, settlement, timestamps, isBackend: true
 * }
 */

const party = (p) => (p ? { id: p.id, name: p.fullName } : undefined)

/** Status history: the detail has `history`; lists only have timestamps, which give the same steps. */
function timelineOf(order) {
  if (Array.isArray(order.history) && order.history.length) {
    return order.history.map((h) => ({ status: h.status, at: h.changedAt, by: h.changedBy, note: h.note ?? null }))
  }
  const t = order.timestamps ?? {}
  return [
    ['PENDING', t.createdAt],
    ['AWAITING_PAYMENT', t.confirmedAt],
    ['PAID', t.paidAt],
    ['DELIVERING', t.shippedAt],
    ['COMPLETED', t.completedAt],
    ['CANCELLED', t.cancelledAt],
  ]
    .filter(([, at]) => at)
    .map(([status, at]) => ({ status, at }))
}

export function toOrder(order) {
  if (!order) return null
  const delivery = order.delivery
    ? { fullName: order.delivery.recipientName, phone: order.delivery.recipientPhone, address: order.delivery.address }
    : null
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    role: (order.role ?? '').toLowerCase(),
    buyer: party(order.buyer),
    seller: party(order.seller),
    items: (order.items ?? []).map((item) => ({
      productId: item.productId,
      title: item.title,
      image: item.imageUrl ?? undefined,
      price: item.unitPrice,
      quantity: item.quantity,
    })),
    amount: order.amounts?.total ?? 0,
    amounts: order.amounts ?? { subtotal: 0, shippingFee: 0, total: 0 },
    shipping: order.shipping ?? null,
    delivery,
    paymentMethod: order.paymentProvider ?? null,
    confirmBy: order.deadlines?.confirmBy ?? null,
    paymentDueAt: order.deadlines?.paymentDueAt ?? null,
    createdAt: order.timestamps?.createdAt ?? null,
    timestamps: order.timestamps ?? {},
    timeline: timelineOf(order),
    actions: order.actions ?? [],
    payments: order.payments ?? [],
    shipment: order.shipment ?? null,
    cancellationReason: order.cancellationReason ?? null,
    disputes: order.disputes ?? [],
    settlement: order.settlement ?? null,
    isBackend: true,
  }
}

/** Shipping quote groups (POST /api/shipping/quotes) keyed by seller, options sorted by fee (cheapest first). */
export function toQuote(quote) {
  if (!quote) return null
  return {
    deliveryZone: quote.deliveryZone,
    expiresAt: quote.expiresAt,
    freeRadiusKm: quote.freeRadiusKm,
    disclaimer: quote.disclaimer,
    simulated: quote.simulated,
    formulaVersion: quote.formulaVersion,
    groups: (quote.groups ?? []).map((group) => ({
      ...group,
      distanceKm: group.distanceKm != null ? Number(group.distanceKm) : null,
      options: [...(group.options ?? [])].sort((a, b) => (a.available === b.available ? (a.fee ?? 0) - (b.fee ?? 0) : a.available ? -1 : 1)),
    })),
  }
}

/** Default carrier per seller: the cheapest available option. @returns {{ [sellerId]: carrier }} */
export function defaultCarriers(quote) {
  const choice = {}
  quote?.groups.forEach((group) => {
    const option = group.available ? group.options.find((o) => o.available && o.quoteToken) : null
    if (option) choice[group.sellerId] = option.carrier
  })
  return choice
}

/**
 * Totals shown before checkout, from the server's quote: merchandise per seller + the chosen option's fee.
 * The backend recomputes everything at checkout; these are only displayed.
 */
export function checkoutTotals(items, quote, carriers) {
  const bySeller = new Map()
  items.forEach((item) => bySeller.set(item.sellerId, (bySeller.get(item.sellerId) ?? 0) + item.price))
  let subtotal = 0
  let shipping = 0
  let complete = Boolean(quote)
  const groups = [...bySeller.entries()].map(([sellerId, groupSubtotal]) => {
    const group = quote?.groups.find((g) => g.sellerId === sellerId)
    const option = group?.options.find((o) => o.carrier === carriers[sellerId] && o.available)
    if (!option) complete = false
    subtotal += groupSubtotal
    shipping += option?.fee ?? 0
    return { sellerId, subtotal: groupSubtotal, fee: option?.fee ?? null, option: option ?? null, group: group ?? null }
  })
  return { groups, subtotal, shipping, total: subtotal + shipping, complete }
}

/** The `shipping` choices for POST /api/checkout: one per seller, token only (no amount is ever sent). */
export function shippingChoices(quote, carriers) {
  return (quote?.groups ?? []).map((group) => {
    const option = group.options.find((o) => o.carrier === carriers[group.sellerId])
    return { sellerId: group.sellerId, carrier: option?.carrier, quoteToken: option?.quoteToken }
  })
}

/** Order ids this buyer already holds for the listings of a refused retry (409 with existingOrderIds), or []. */
export function existingOrderIds(error) {
  const field = error?.fieldErrors?.find?.((f) => f.field === 'existingOrderIds')
  return field ? field.message.split(',').map(Number).filter(Boolean) : []
}
