import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import { PATHS } from '../../routes/paths'
import ProseSection from '../../components/content/ProseSection'
import Alert from '../../components/ui/Alert'

const SECTIONS = [
  { id: 'collect', title: 'What we collect' },
  { id: 'use', title: 'How we use it' },
  { id: 'share', title: 'What other students see' },
  { id: 'payments', title: 'Payments' },
  { id: 'keep', title: 'How long we keep data' },
  { id: 'rights', title: 'Your choices' },
  { id: 'contact', title: 'Contact' },
]

/** Privacy policy (draft written for the course project; to be reviewed before a public launch). */
export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy policy" eyebrow="Legal" intro="How UniMarket handles your personal information." toc={SECTIONS}>
      <Alert variant="warning" title="Draft" className="mb-6">
        This policy was written for the ISC301 course project and has not been reviewed by a lawyer. It must be reviewed before UniMarket launches publicly.
      </Alert>
      <ProseSection id="collect" title="What we collect">
        <ul>
          <li><strong>Account details:</strong> your name, email address and password (stored only in encrypted, hashed form).</li>
          <li><strong>Listings:</strong> photos, descriptions, prices and the campus you choose.</li>
          <li><strong>Orders:</strong> what you buy or sell, and the delivery details you give at checkout (name, phone number, campus address, note).</li>
          <li><strong>Messages to support</strong> that you send through the Contact page.</li>
        </ul>
      </ProseSection>
      <ProseSection id="use" title="How we use it">
        <p>We use your information to run the marketplace: verifying your email, showing your listings, processing orders, letting sellers deliver to you, preventing fraud and answering your questions. We don’t sell your personal data.</p>
      </ProseSection>
      <ProseSection id="share" title="What other students see">
        <p>Other students see your name, verified badge, programme and campus on your listings. When you order an item, the seller sees the delivery details you entered so they can deliver it. Your email address and password are never shown.</p>
      </ProseSection>
      <ProseSection id="payments" title="Payments">
        <p>Payments are handled online by payment providers (such as MoMo, ZaloPay or card payment). UniMarket does not store full card numbers. In the current demo, payments are simulated and no payment data is collected.</p>
      </ProseSection>
      <ProseSection id="keep" title="How long we keep data">
        <p>We keep your account data while your account is open. Order records are kept as long as needed for buyers, sellers and any disputes, and as required by law.</p>
      </ProseSection>
      <ProseSection id="rights" title="Your choices">
        <p>You can edit or delete your listings at any time and ask us to correct or delete your account data. Some order records may need to be kept, as explained above.</p>
      </ProseSection>
      <ProseSection id="contact" title="Contact">
        <p>
          Questions about your privacy? <Link to={PATHS.contact}>Contact us</Link>.
        </p>
      </ProseSection>
    </ContentPage>
  )
}
