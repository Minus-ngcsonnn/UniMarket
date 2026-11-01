import { Link } from 'react-router'
import PageContainer from '../components/layout/PageContainer'
import { buttonClasses } from '../components/ui/buttonClasses'
import EmptyState from '../components/ui/EmptyState'
import { PATHS } from '../routes/paths'

/** Shown for links to pages that are planned but not built yet, and for unknown URLs. */
export default function NotAvailablePage() {
  return (
    <PageContainer width="md" className="py-16">
      <title>Not available yet · UniMarket</title>
      <EmptyState
        titleAs="h1"
        title="This page isn’t available yet"
        description="We’re still building this part of UniMarket. Please check back soon."
        action={
          <Link to={PATHS.home} className={buttonClasses({ variant: 'secondary' })}>
            Back to homepage
          </Link>
        }
      />
    </PageContainer>
  )
}
