import type { Metadata } from "next";
import { JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { PaletteBootstrap } from "@/components/palette-bootstrap";
import "./globals.css";

const fontPaper = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-paper",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Personal Archive System",
  description: "A terminal interface for Feng's personal digital archive.",
  metadataBase: new URL("https://cylf.me"),
  openGraph: {
    title: "Personal Archive System",
    description: "A terminal interface for a personal digital archive.",
    url: "https://cylf.me",
    siteName: "cylf.me",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-palette="cool-atelier"
      className={`${fontPaper.variable} ${fontMono.variable}`}
    >
      <body>
        <PaletteBootstrap />
        {children}
      </body>
    </html>
  );
}
