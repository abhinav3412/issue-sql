import type { Metadata } from "next";
import "./globals.css";
//import RedirectToLocalhost from "./RedirectToLocalhost";
import LocationPrompt from "./LocationPrompt";
import { NotificationProvider } from "./NotificationSystem";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Automotive Grade Fuel",
  description: "Emergency fuel delivery and roadside assistance",
  icons: {
    icon: "/logo.ico",
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          {/* <RedirectToLocalhost /> */}
          <LocationPrompt />
          {children}
        </NotificationProvider>

      </body>
    </html>
  );
}

