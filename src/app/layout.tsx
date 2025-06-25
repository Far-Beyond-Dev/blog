'use client';

import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Inter } from 'next/font/google';
import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

const inter = Inter({ subsets: ['latin'] });

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    const target = e.target as HTMLElement | null;

    if (
      target?.tagName === 'SCRIPT' &&
      (target as HTMLScriptElement).src?.includes('/_next/static/chunks')
    ) {
      console.warn('[ChunkLoadError] Reloading due to missing chunk:', (target as HTMLScriptElement).src);
      window.location.reload();
    }
  });
}



const metadata = {
  title: 'Blog - Horizon - Far Beyond',
  description: "A blog Far Beyond's developers use to share their knowledge, experiences, insights, and updates on our projects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Detect user/system theme
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
    });
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={metadata.description} />
        <title>{metadata.title}</title>
      </head>

      <body
        className={`${inter.className} min-h-screen flex flex-col bg-gray-100 dark:bg-black text-gray-900 dark:text-gray-100`}
      >
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
