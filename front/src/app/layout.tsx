import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { OnboardingProvider } from "@/context/OnboardingContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sako Business",
  description: "Self-onboarding KYB assisté par IA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><OnboardingProvider>{children}</OnboardingProvider></body>
    </html>
  );
}
