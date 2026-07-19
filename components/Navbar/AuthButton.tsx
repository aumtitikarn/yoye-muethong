"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SessionUser {
  sub: string;
  name: string;
  picture?: string;
  email?: string;
}

export default function AuthButton({ compact = false }: { compact?: boolean }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (active) setUser(data.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const btnSize = compact ? "h-9 px-3" : "h-10 px-4";
  const textSize = compact ? "text-xs" : "text-sm";
  const iconSize = compact ? 20 : 24;

  if (loading) {
    return (
      <div
        className={`${btnSize} rounded-full bg-muted/60 animate-pulse ${
          compact ? "w-24" : "w-32"
        }`}
      />
    );
  }

  const handleLogin = () => {
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
      returnTo
    )}`;
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.reload();
  };

  if (!user) {
    return (
      <Button
        onClick={handleLogin}
        className={`${btnSize} rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg gap-2`}
      >
        <Image
          src="/LINE_APP_Android.png"
          alt="LINE"
          width={iconSize}
          height={iconSize}
          className="rounded-full"
        />
        <span className={textSize}>เข้าสู่ระบบ</span>
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`${btnSize} flex items-center gap-2 rounded-full border border-border/60 bg-white hover:bg-muted/50 transition shadow-sm`}
        >
          <span className="relative inline-block h-7 w-7 overflow-hidden rounded-full bg-muted">
            {user.picture ? (
              <Image
                src={user.picture}
                alt={user.name}
                fill
                sizes="28px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span
            className={`${textSize} font-medium text-foreground max-w-[8rem] truncate`}
          >
            {user.name}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="relative inline-block h-9 w-9 overflow-hidden rounded-full bg-muted">
            {user.picture ? (
              <Image
                src={user.picture}
                alt={user.name}
                fill
                sizes="36px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.name}
            </p>
            {user.email && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </div>
        <div className="my-1 h-px bg-border" />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50 transition"
        >
          <LogOut className="h-4 w-4" />
          ออกจากระบบ
        </button>
      </PopoverContent>
    </Popover>
  );
}
