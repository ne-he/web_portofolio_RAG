import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Powers the "Ask Nemi everything." hero headline. Space Grotesk has no italic
// face, so the italic "everything." is browser-synthesized: exactly as in Hero.html.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const SITE_URL = "https://web-portofolio-rag.vercel.app";
const DESCRIPTION = "Ngobrol langsung sama AI-nya Nehemiah: pengalaman, project, & kepribadian.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Nemi · Ask Nemi Everything",
  description: DESCRIPTION,
  // Link previews on WhatsApp, LinkedIn and X used to show a bare URL.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Ask Nemi",
    title: "Ask Nemi · CV Nehemiah yang bisa diajak ngobrol",
    description: DESCRIPTION,
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ask Nemi · CV Nehemiah yang bisa diajak ngobrol",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
