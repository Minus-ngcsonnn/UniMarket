import ContentPage from '../../components/content/ContentPage'
import ProseSection from '../../components/content/ProseSection'
import Alert from '../../components/ui/Alert'

const SECTIONS = [
  { id: 'who', title: 'Who can use UniMarket' },
  { id: 'listings', title: 'Listing items' },
  { id: 'orders', title: 'Orders' },
  { id: 'payments', title: 'Payments' },
  { id: 'delivery', title: 'Delivery and receipt' },
  { id: 'prohibited', title: 'Not allowed' },
  { id: 'changes', title: 'Changes to these terms' },
]

/** Terms of service (draft for the course project), following the Business Plan rules. */
export default function TermsPage() {
  return (
    <ContentPage title="Terms of service" eyebrow="Legal" intro="The rules for buying and selling on UniMarket." toc={SECTIONS}>
      <Alert variant="warning" title="Draft" className="mb-6">
        These terms were written for the ISC301 course project and have not been reviewed by a lawyer. They must be reviewed before UniMarket launches publicly.
      </Alert>
      <ProseSection id="who" title="Who can use UniMarket">
        <p>UniMarket is for university students. You must verify your email address and keep your account details accurate. You are responsible for activity on your account.</p>
      </ProseSection>
      <ProseSection id="listings" title="Listing items">
        <ul>
          <li>Only list items you own and are allowed to sell.</li>
          <li>Describe the condition honestly (New, Like new or Used) and use your own photos.</li>
          <li>Each listing is one item. Listing is free.</li>
        </ul>
      </ProseSection>
      <ProseSection id="orders" title="Orders">
        <ul>
          <li>Placing an order is a request to buy. The seller must confirm or decline it within 24 hours.</li>
          <li>While an order is open, the listing is reserved for the buyer.</li>
          <li>The buyer can cancel an order until it has been paid.</li>
        </ul>
      </ProseSection>
      <ProseSection id="payments" title="Payments">
        <p>
          <strong>All payments must be made online through UniMarket</strong> after the seller confirms. Cash on delivery and direct bank transfers between students are not allowed, and payments made outside UniMarket are not protected.
        </p>
      </ProseSection>
      <ProseSection id="delivery" title="Delivery and receipt">
        <p>The seller delivers the item to the campus address the buyer gave at checkout, after payment. The buyer confirms receipt once the item matches the listing, which completes the order.</p>
      </ProseSection>
      <ProseSection id="prohibited" title="Not allowed">
        <ul>
          <li>Illegal, dangerous, stolen or counterfeit items, and academic dishonesty services.</li>
          <li>Misleading listings, fake accounts, harassment or spam.</li>
          <li>Asking for or accepting payment outside UniMarket.</li>
        </ul>
        <p>We may remove listings or suspend accounts that break these rules.</p>
      </ProseSection>
      <ProseSection id="changes" title="Changes to these terms">
        <p>We may update these terms as UniMarket develops. We’ll tell you about important changes before they apply.</p>
      </ProseSection>
    </ContentPage>
  )
}
