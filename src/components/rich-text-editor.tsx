'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useState } from 'react';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Rich-text editor.
 *
 * Officers never see or type HTML — that was the whole point of replacing the
 * "copy this block and edit it" workflow. The toolbar exposes only formatting
 * the public site's stylesheet actually supports, so nothing produced here can
 * look broken once published.
 *
 * Output is sanitized again on the server before it reaches the website; this
 * component is a usability layer, not a security boundary.
 */

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'rounded p-1.5 transition-colors',
        active ? 'bg-navy-100 text-navy-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-700'
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const addLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address (leave empty to remove the link)', previous ?? '');

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-ink-50 px-2 py-1.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-ink-200" aria-hidden="true" />

      <ToolbarButton
        label="Heading"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <span className="px-1 text-sm font-bold">H</span>
      </ToolbarButton>
      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Add link" active={editor.isActive('link')} onClick={addLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-ink-200" aria-hidden="true" />

      <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  name,
  defaultValue = '',
  placeholder = 'Start writing…',
  minHeight = 200,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  minHeight?: number;
}) {
  const [html, setHtml] = useState(defaultValue);

  const editor = useEditor({
    // Rendering on the server would mismatch on hydration; TipTap manages the
    // DOM itself, so it starts client-side only.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
      }),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        class: 'prose-editor px-4 py-3',
        'data-placeholder': placeholder,
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor: instance }) => setHtml(instance.getHTML()),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-ink-300 bg-white focus-within:border-navy-500 focus-within:ring-2 focus-within:ring-navy-100">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {/* The form submits the serialized HTML, not the editor instance. */}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
