import './globals.css';

export const metadata = {
  title: 'Football-CLI — Live Football Stats & Game Links',
  description:
    'A Next.js rebuild of Football-CLI: standings, match scores, top scorers, Champions League, live streams and highlights in a terminal-style web UI.',
};

export const viewport = {
  themeColor: '#050807',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
