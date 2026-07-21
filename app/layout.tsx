import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Serif_SC, Source_Serif_4 } from "next/font/google";
import { PaletteBootstrap } from "@/components/palette-bootstrap";
import "./globals.css";

/** 拉丁衬线：英文标题与混排西文 */
const fontPaperLatin = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-paper-latin",
  display: "swap",
});

/** 中文衬线：与拉丁分轨，浏览器按字形回落 */
const fontPaperCjk = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-paper-cjk",
  display: "swap",
  preload: true,
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "个人档案系统 · cylf.me",
  description: "终端探索、纸面阅读的个人数字档案。",
  metadataBase: new URL("https://cylf.me"),
  openGraph: {
    title: "个人档案系统 · cylf.me",
    description: "终端探索、纸面阅读的个人数字档案。",
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
      data-paper-grain="medium"
      data-type-scale="reading"
      className={`${fontPaperLatin.variable} ${fontPaperCjk.variable} ${fontMono.variable}`}
    >
      <body>
        <PaletteBootstrap />
        {children}
      </body>
    </html>
  );
}
