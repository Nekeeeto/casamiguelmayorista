"use client";

import { ThemeToggle } from "@/components/theme-toggle";

export function CabeceraAuthAcciones() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-3 sm:p-4">
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
