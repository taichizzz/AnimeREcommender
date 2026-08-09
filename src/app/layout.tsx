import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Atelier redesign face — single weight, per the style reference
// (HelveticaNowDisplay-Light substitute; the doc lists Inter as its stand-in).
const inter = Inter({
  variable: "--font-inter",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Animer",
  description: "Discover your next anime — personalized recommendations based on your taste.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
