/**
 * Help center questions, grouped by topic. Answers follow the Business Plan rules
 * (online payment only, seller confirms within 24 h, university email or personal email + OTP).
 */
export const FAQ_GROUPS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      { q: 'Who can use UniMarket?', a: 'UniMarket is for university students. The pilot runs at FPT University, starting with the Hanoi (Hoa Lac) campus.' },
      { q: 'How do I create an account?', a: 'Register with your university email (@fpt.edu.vn) or a personal email. We send a 6-digit code to verify the address before you can buy or sell.' },
      { q: 'Does it cost anything?', a: 'Creating an account, browsing and listing items are free.' },
    ],
  },
  {
    id: 'buying',
    title: 'Buying',
    items: [
      { q: 'How do I buy an item?', a: 'Add it to your cart (or use Buy now), enter where it should be delivered and send the order request. The seller confirms within 24 hours, then you pay online.' },
      { q: 'I bought from several sellers. Why do I have several orders?', a: 'Checkout creates one order per seller. Each seller confirms, gets paid for and delivers their own order, so items from the same seller arrive together.' },
      { q: 'Can I cancel an order?', a: 'Yes, until you have paid. Open My orders and choose “Cancel order”. The listing becomes available to other students again.' },
      { q: 'What if the seller doesn’t confirm?', a: 'Sellers have 24 hours to confirm. If they decline, the order is cancelled and nothing is charged.' },
    ],
  },
  {
    id: 'selling',
    title: 'Selling',
    items: [
      { q: 'How do I list an item?', a: 'Choose “Sell an item”, add up to 8 photos, a clear title, the category and condition, an honest description and your price. Listing is free.' },
      { q: 'What happens when someone orders my item?', a: 'You get an order in My orders → Sales (one order with all the items that buyer chose from you). Confirm or decline it within 24 hours. The listings are reserved while the order is open.' },
      { q: 'When should I deliver?', a: 'Only after the buyer has paid online. The order then shows “Paid”; deliver the item and mark the order as delivering.' },
      { q: 'Can I edit or delete a listing?', a: 'Yes, from My listings. Sold listings can’t be edited, so the buyer’s order history stays accurate.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & delivery',
    items: [
      { q: 'How do I pay?', a: 'Only online through UniMarket (e.g. MoMo, ZaloPay or bank card), after the seller confirms. Cash on delivery and direct bank transfers to sellers are not allowed.' },
      { q: 'Who arranges delivery?', a: 'The seller delivers the item to the campus address you gave at checkout, after your payment.' },
      { q: 'When is an order complete?', a: 'When you confirm in My orders that you have received the item and it matches the listing.' },
    ],
  },
  {
    id: 'safety',
    title: 'Account & safety',
    items: [
      { q: 'Someone asked me to pay outside UniMarket. What should I do?', a: 'Don’t. Payments outside UniMarket aren’t protected. Please report the user through the Contact page.' },
      { q: 'How do I report a listing or a user?', a: 'Use the Contact page and choose “Report a listing or user”, with the listing ID (e.g. UM-2048) or order number (e.g. UO-3001).' },
    ],
  },
]
