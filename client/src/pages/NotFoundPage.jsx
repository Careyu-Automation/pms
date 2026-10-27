import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageContainer, PageContent } from '../components/layout/PageContainer';
import { ErrorState } from '../components/ui/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <PageContainer>
      <PageHeader
        title="Page not found"
        description="This address is not part of the CareYu workspace."
      />
      <PageContent>
        <ErrorState
          title="Page not found"
          description="Check the address, or return to the dashboard."
          action={<Link className="btn btn--primary" to="/dashboard">Go to dashboard</Link>}
        />
      </PageContent>
    </PageContainer>
  );
}
