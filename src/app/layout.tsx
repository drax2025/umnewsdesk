import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/shell/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Union Media Newsroom",
  description: "Silicon Scotland editorial production system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets the class on <html> before
    // React hydrates, so the server's markup and the client's differ by design.
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
