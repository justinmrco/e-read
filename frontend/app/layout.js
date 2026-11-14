import "./globals.css";
export const metadata = { title: "E-Read | Academic Bookstore", description: "Explore the E-Read academic bookstore demo, with sandbox checkout and a shared sample reader." };
export default function RootLayout({ children }) { return <html lang="en"><head>{/* eslint-disable-next-line @next/next/no-page-custom-font */}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cal+Sans&family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500&family=Bricolage+Grotesque:wght@400;500;600;700&display=swap" /></head><body>{children}</body></html>; }
