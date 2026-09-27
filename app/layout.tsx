import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Architecture to 3D World',
  description: 'Turn a software repository into an interactive 3D city that explains its architecture.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0b0f16', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}