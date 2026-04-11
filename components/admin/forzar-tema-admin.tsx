"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function ForzarTemaAdmin() {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme("dark");
  }, [setTheme]);

  return null;
}
