import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { ICONS } from '../../components/common/icons';
import { PageContainer, PageContent } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';

export default function ModulePage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const Icon = ICONS[meta.icon];

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={<Badge tone="neutral">Later phase</Badge>}
      />
      <PageContent>
        <EmptyState icon={Icon} title="No records yet" description={meta.note} />
      </PageContent>
    </PageContainer>
  );
}
