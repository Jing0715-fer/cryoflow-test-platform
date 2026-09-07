"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Snowflake, Moon, Sun, Activity } from "lucide-react";
import { ExportReportButton } from "./export-report";
import { cn } from "@/lib/utils";
import { useMounted } from "./section-shell";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "#overview", label: "总览" },
  { href: "#matrix", label: "测试矩阵" },
  { href: "#findings", label: "问题发现" },
  { href: "#topaz", label: "Topaz 专项" },
  { href: "#architecture", label: "HPC 架构" },
  { href: "#simulator", label: "调度模拟器" },
  { href: "#sbatch", label: "SBATCH 生成器" },
];

export function Navbar({ passed, total }: { passed: number; total: number }) {
  const mounted = useMounted();
  const { resolvedTheme, setTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl transition-shadow",
        scrolled ? "border-border/80 shadow-sm" : "border-transparent bg-background/70"
      )}
      style={{ backgroundColor: "color-mix(in srgb, var(--background) 82%, transparent)" }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a href="#overview" className="flex items-center gap-2.5" aria-label="回到顶部">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Snowflake className="h-5 w-5" aria-hidden />
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-sm font-bold tracking-tight">CryoFlow</span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">全面测试 · HPC 调度设计</span>
          </span>
        </a>

        <nav aria-label="页面导航" className="ml-2 hidden flex-1 items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-teal-300/60 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300 md:inline-flex">
            <Activity className="h-3 w-3 soft-pulse" aria-hidden />
            {passed}/{total} 通过
          </span>
          <ExportReportButton />
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            aria-label={resolvedTheme === "dark" ? "切换到浅色模式" : "切换到暗色模式"}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {mounted && resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* mobile nav: horizontally scrollable */}
      <nav
        aria-label="移动端导航"
        className="nice-scroll flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-1.5 lg:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
