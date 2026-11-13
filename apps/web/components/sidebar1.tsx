"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { label: "概览", href: "/dashboard", icon: LayoutDashboard },
  { label: "信息流", href: "/feed", icon: Newspaper },
  { label: "采集记录", href: "/runs", icon: Activity },
];

function SidebarBrand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            X
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 leading-none">
            <span className="font-semibold">X Intelligence</span>
            <span className="text-xs text-muted-foreground">
              For You 工作区
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作区</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-md border bg-background/60 p-3 text-xs leading-5 text-muted-foreground group-data-[collapsible=icon]:hidden">
          已采集内容与分类结果会显示在信息流中。
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function currentPage(pathname: string): string {
  return navigation.find((item) => item.href === pathname)?.label ?? "工作区";
}

function Sidebar1({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = currentPage(pathname);

  return (
    <SidebarProvider className="min-h-svh bg-background">
      <AppSidebar pathname={pathname} />
      <SidebarInset className="min-h-svh bg-background">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-6">
          <SidebarTrigger aria-label="切换侧边栏" className="-ml-1" />
          <Separator
            orientation="vertical"
            className="h-4 data-[orientation=vertical]:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:flex">
                <span className="text-muted-foreground">X Intelligence</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:flex" />
              <BreadcrumbItem>
                <BreadcrumbPage>{page}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export { Sidebar1 };
