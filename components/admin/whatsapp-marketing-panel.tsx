"use client";

import type { ComponentType } from "react";
import { Suspense, useMemo } from "react";
import {
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  MessageSquareReply,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";

import { WhatsappBandejaTab } from "@/components/admin/whatsapp-bandeja-tab";
import { WhatsappBroadcastTab } from "@/components/admin/whatsapp-broadcast-tab";
import { WhatsappConfiguracionTab } from "@/components/admin/whatsapp-configuracion-tab";
import { WhatsappContactosTab } from "@/components/admin/whatsapp-contactos-tab";
import { WhatsappHomeTab } from "@/components/admin/whatsapp-home-tab";
import { WhatsappNotificacionesWooTab } from "@/components/admin/whatsapp-notificaciones-woo-tab";
import { WhatsappSystemTemplatesTab } from "@/components/admin/whatsapp-system-templates-tab";
import { WhatsappTemplatesTab } from "@/components/admin/whatsapp-templates-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES = [
  "inicio",
  "templates",
  "system-templates",
  "contactos",
  "broadcast",
  "bandeja",
  "notif-woo",
  "configuracion",
] as const;

type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string): v is TabValue {
  return (TAB_VALUES as readonly string[]).includes(v);
}

function TabIconLabel({
  icon: Icon,
  label,
}: Readonly<{ icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string }>) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      {label}
    </span>
  );
}

function WhatsappMarketingPanelInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = useMemo(() => {
    const t = searchParams.get("tab");
    return t && isTabValue(t) ? t : "inicio";
  }, [searchParams]);

  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "inicio") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">WhatsApp Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Broadcasts con templates aprobados, bandeja de respuestas en vivo y notificaciones automáticas desde
          WooCommerce — todo sobre tu número de WhatsApp Business Cloud API.
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto min-h-10 w-full flex-wrap items-stretch justify-start gap-1 bg-muted p-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="inicio" className="px-3 py-2">
            <TabIconLabel icon={LayoutDashboard} label="Inicio" />
          </TabsTrigger>
          <TabsTrigger value="templates" className="px-3 py-2">
            <TabIconLabel icon={LayoutTemplate} label="Templates Meta" />
          </TabsTrigger>
          <TabsTrigger value="system-templates" className="px-3 py-2">
            <TabIconLabel icon={MessageSquareReply} label="Respuestas rápidas" />
          </TabsTrigger>
          <TabsTrigger value="contactos" className="px-3 py-2">
            <TabIconLabel icon={Users} label="Contactos" />
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="px-3 py-2">
            <TabIconLabel icon={Megaphone} label="Broadcast" />
          </TabsTrigger>
          <TabsTrigger value="bandeja" className="px-3 py-2">
            <TabIconLabel icon={Inbox} label="Bandeja" />
          </TabsTrigger>
          <TabsTrigger value="notif-woo" className="px-3 py-2">
            <TabIconLabel icon={ShoppingBag} label="Notificaciones Woo" />
          </TabsTrigger>
          <TabsTrigger value="configuracion" className="px-3 py-2">
            <TabIconLabel icon={Settings} label="Configuración" />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inicio">
          <WhatsappHomeTab />
        </TabsContent>
        <TabsContent value="templates">
          <WhatsappTemplatesTab />
        </TabsContent>
        <TabsContent value="system-templates">
          <WhatsappSystemTemplatesTab />
        </TabsContent>
        <TabsContent value="contactos">
          <WhatsappContactosTab />
        </TabsContent>
        <TabsContent value="broadcast">
          <WhatsappBroadcastTab />
        </TabsContent>
        <TabsContent value="bandeja">
          <WhatsappBandejaTab />
        </TabsContent>
        <TabsContent value="notif-woo">
          <WhatsappNotificacionesWooTab />
        </TabsContent>
        <TabsContent value="configuracion">
          <WhatsappConfiguracionTab />
        </TabsContent>
      </Tabs>
      <Toaster theme="dark" richColors position="top-center" closeButton />
    </div>
  );
}

function PanelSuspenseFallback() {
  return (
    <div className="space-y-4">
      <div className="h-16 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full max-w-3xl animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

export function WhatsappMarketingPanel() {
  return (
    <Suspense fallback={<PanelSuspenseFallback />}>
      <WhatsappMarketingPanelInner />
    </Suspense>
  );
}
