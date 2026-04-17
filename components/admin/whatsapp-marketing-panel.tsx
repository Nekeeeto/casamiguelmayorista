"use client";

import { Toaster } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsappBandejaTab } from "@/components/admin/whatsapp-bandeja-tab";
import { WhatsappBroadcastTab } from "@/components/admin/whatsapp-broadcast-tab";
import { WhatsappConfiguracionTab } from "@/components/admin/whatsapp-configuracion-tab";
import { WhatsappContactosTab } from "@/components/admin/whatsapp-contactos-tab";
import { WhatsappNotificacionesWooTab } from "@/components/admin/whatsapp-notificaciones-woo-tab";
import { WhatsappSystemTemplatesTab } from "@/components/admin/whatsapp-system-templates-tab";
import { WhatsappTemplatesTab } from "@/components/admin/whatsapp-templates-tab";

export function WhatsappMarketingPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">WhatsApp Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Broadcasts con templates aprobados, bandeja de respuestas en vivo y notificaciones automáticas desde
          WooCommerce — todo sobre tu número de WhatsApp Business Cloud API.
        </p>
      </div>
      <Tabs defaultValue="configuracion" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
          <TabsTrigger value="templates">Templates Meta</TabsTrigger>
          <TabsTrigger value="system-templates">Templates del sistema</TabsTrigger>
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="notif-woo">Notificaciones Woo</TabsTrigger>
        </TabsList>
        <TabsContent value="configuracion">
          <WhatsappConfiguracionTab />
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
      </Tabs>
      <Toaster theme="dark" richColors position="top-center" closeButton />
    </div>
  );
}
