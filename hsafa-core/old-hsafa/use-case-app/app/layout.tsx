import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hsafa Use Case — AI Chat",
  description: "User registration + AI assistant chat demo with Hsafa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-dvh">
        <ThemeProvider defaultTheme="dark" storageKey="hsafa-usecase-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
