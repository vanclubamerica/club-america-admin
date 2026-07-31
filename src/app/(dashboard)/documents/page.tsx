import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Alert } from '@/components/ui';
import { DocumentManager } from './document-manager';

export const metadata: Metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="The club's constitution, meeting agendas, sponsor packets, forms, and resources."
      />

      <Alert tone="info">
        Documents are stored privately. Only signed-in officers can download them, using links that
        expire after a few minutes.
      </Alert>

      <DocumentManager documents={documents ?? []} />
    </div>
  );
}
