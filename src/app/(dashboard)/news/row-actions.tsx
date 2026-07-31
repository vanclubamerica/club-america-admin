'use client';

import { useActionState } from 'react';
import { deleteNewsPost, setNewsStatus } from './actions';
import type { ActionState } from '@/lib/actions';
import { Button } from '@/components/ui';
import type { ContentStatus } from '@/types/database';

/** Inline publish/archive/delete controls for one row of the news list. */
export function NewsRowActions({ id, status }: { id: string; status: ContentStatus }) {
  const [, statusAction] = useActionState<ActionState, FormData>(setNewsStatus, {});
  const [, deleteAction] = useActionState<ActionState, FormData>(deleteNewsPost, {});

  return (
    <div className="flex items-center gap-2">
      {status !== 'published' && (
        <form action={statusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="published" />
          <Button type="submit" size="sm" variant="secondary">
            Publish
          </Button>
        </form>
      )}

      {status === 'published' && (
        <form action={statusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="archived" />
          <Button type="submit" size="sm" variant="ghost">
            Archive
          </Button>
        </form>
      )}

      <form
        action={deleteAction}
        onSubmit={(event) => {
          // Deleting removes the post entirely; archiving is the reversible
          // option, so make sure this was intentional.
          if (!window.confirm('Delete this announcement permanently? Archiving hides it instead.')) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant="ghost">
          Delete
        </Button>
      </form>
    </div>
  );
}
