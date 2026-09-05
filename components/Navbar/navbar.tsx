"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Calendar, Search, MessageSquare } from "lucide-react";
import AuthButton from "@/components/Navbar/AuthButton";

const navItems = [
  { label: "หน้าแรก", href: "/", path: "/", icon: Home },
  { label: "จองคิว", href: "bookings", path: "/bookings", icon: Calendar },
  { label: "ติดตามสถานะ", href: "tracking", path: "/tracking", icon: Search },
  { label: "รีวิว", href: "reviews", path: "/reviews", icon: MessageSquare },
];

export default function Navbar() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {/* Desktop Navbar - Top */}
      <nav className="hidden md:block w-full border-b border-border/70 bg-white/90 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6 py-4 px-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md overflow-hidden border border-border/50">
              <Image
                src="/logo/logo.jpg"
                alt="Yoye MueThong logo"
                width={60}
                height={60}
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground uppercase tracking-widest">
                ยยมือทองกดบัตร
              </p>
              <p className="text-sm text-foreground">@yji_ticket</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-base font-medium text-muted-foreground">
            {navItems.map((item) => {
              const isActive = item.path === pathname;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={`transition ${
                    isActive
                      ? "text-foreground font-bold"
                      : "hover:text-foreground"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
          <AuthButton />
        </div>
      </nav>

      {/* Mobile Top Bar - Logo & Login */}
      <div className="md:hidden w-full border-b border-border/70 bg-white/90 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md overflow-hidden border border-border/50">
              <Image
                src="/logo/logo.jpg"
                alt="Yoye MueThong logo"
                width={50}
                height={50}
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground uppercase tracking-widest">
                ยยมือทองกดบัตร
              </p>
              <p className="text-xs text-foreground">@yji_ticket</p>
            </div>
          </div>
          <AuthButton compact />
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border/70 shadow-lg">
        <div className="grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const isActive = item.path === pathname;
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center justify-center py-3 px-2 transition-colors ${
                  isActive
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={`w-5 h-5 mb-1 ${
                    isActive ? "stroke-[2.5]" : "stroke-[2]"
                  }`}
                />
                <span
                  className={`text-xs ${
                    isActive ? "font-semibold" : "font-medium"
                  }`}
                >
                  {item.label}
                </span>
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}
