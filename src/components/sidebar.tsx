'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Building2,
  CalendarDays,
  FileText,
  Gauge,
  Info,
  Menu,
  Newspaper,
  Palette,
  Repeat,
  ScrollText,
  Settings as SettingsIcon,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Primary navigation. Order matches how officers actually work: things changed
 * weekly (news, officers, sponsors, events) sit above things touched once a
 * year (themes, transfer, settings).
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: Gauge },
  { href: '/news', label: 'News', icon: Newspaper },
  { href: '/officers', label: 'Officers', icon: UserCog },
  { href: '/sponsors', label: 'Sponsors', icon: Building2 },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/about', label: 'About', icon: Info },
  { href: '/themes', label: 'Themes', icon: Palette },
  { href: '/transfer', label: 'Leadership Transfer', icon: Repeat },
  { href: '/logs', label: 'Activity Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-navy-700 text-white' : 'text-navy-100 hover:bg-navy-800 hover:text-white'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="border-t border-navy-800 px-5 py-4">
      <p className="truncate text-sm font-semibold text-white">{userName}</p>
      <p className="text-xs text-navy-100">{userRole}</p>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <div>
          <p className="text-sm font-bold text-white">Club America</p>
          <p className="text-xs text-navy-100">Admin</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-white hover:bg-navy-800"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="flex flex-col bg-navy-900 lg:hidden">
          {nav}
          {account}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy-900 lg:flex">
        <div className="border-b border-navy-800 px-5 py-4">
          <p className="text-sm font-bold text-white">Club America</p>
          <p className="text-xs text-navy-100">Van High School Chapter</p>
        </div>
        {nav}
        {account}
      </aside>
    </>
  );
}
