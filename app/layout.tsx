import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Council",
  description: "A responsive AI council room website.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
