import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar/navbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import VisitTracker from "@/components/visit-tracker";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Yoye Muethong",
  description: "Yoye Muethong",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <TooltipProvider>
            <VisitTracker />
            <Navbar />
            {children}
            <Footer />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
