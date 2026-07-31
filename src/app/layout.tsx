import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Club America Admin',
    template: '%s · Club America Admin',
  },
  description:
    'Content management and administration for the Van High School Club America website.',
  // This is a private control panel; it should never appear in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1f3a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        No web fonts on purpose. The system stack keeps the Content-Security-Policy
        locked to same-origin, loads instantly on school wifi, and works if the
        network is flaky — this is a tool, not a brochure.
      */}
      <body>{children}</body>
    </html>
  );
}
