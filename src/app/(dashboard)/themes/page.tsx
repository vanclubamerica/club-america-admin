import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { Alert, PageHeader } from '@/components/ui';
import { ThemeList } from './theme-list';

export const metadata: Metadata = { title: 'Themes' };
export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  const { settings } = await requireUser();
  const supabase = await createClient();

  const { data: themes } = await supabase.from('themes').select('*').order('sort_order');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seasonal themes"
        description="Change the website's colors for holidays and special occasions."
      />

      <Alert tone="info" title="How themes work">
        Selecting a theme writes a separate stylesheet (<code className="font-mono">css/theme.css</code>)
        when you publish. The website&apos;s main design file is never modified, so switching back to{' '}
        <span className="font-medium">Normal</span> always restores the original look exactly.
      </Alert>

      <ThemeList themes={themes ?? []} activeKey={settings.active_theme_key} />
    </div>
  );
}
