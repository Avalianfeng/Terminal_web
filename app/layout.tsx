import type { Metadata } from "next";
import { PaletteBootstrap } from "@/components/palette-bootstrap";
import "./globals.css";

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
    <html lang="zh-CN" data-palette="cool-atelier">
      <body>
        <PaletteBootstrap />
        {children}
      </body>
    </html>
  );
}
