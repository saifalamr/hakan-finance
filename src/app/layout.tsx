import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { DataProvider } from "@/components/data-provider";
export const metadata: Metadata = {
  title: "Finans | Gelir ve Gider Takibi",
  description: "İşinizin finansı, tek bir yerde.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Finans" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#174f46",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={GeistSans.variable}>
      <body>
        <DataProvider>{children}</DataProvider>
      </body>
    </html>
  );
}
