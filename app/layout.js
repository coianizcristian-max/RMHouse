import './globals.css';

export const metadata = {
  title: 'Ritmo Metropolitano',
  description: 'Acrobatic and dance center: prenota la tua lezione di prova',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Ritmo Metropolitano', statusBarStyle: 'default' },
  icons: { icon: '/icona-192.png', apple: '/apple-icon.png' },
};

export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
