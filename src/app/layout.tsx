import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { AuthProvider } from "@/components/AuthProvider";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side so the first HTML already carries the right nav state.
  // The cookie's lifetime is set from the token's own expires_in, so its mere
  // presence is a sound proxy for "signed in" — no call to MAL needed just to
  // decide which button to draw.
  const cookieStore = await cookies();
  const isLoggedIn = !!cookieStore.get("mal_access_token")?.value;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <AuthProvider initialLoggedIn={isLoggedIn}>{children}</AuthProvider>
      </body>
    </html>
  );
}
