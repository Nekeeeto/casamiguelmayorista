"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = DayPickerProps;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        root: cn("w-fit", classNames?.root),
        months: cn("relative flex flex-col gap-4 sm:flex-row", classNames?.months),
        month: cn("flex w-full flex-col gap-4", classNames?.month),
        month_caption: cn(
          "relative mx-10 mb-1 flex h-9 items-center justify-center",
          classNames?.month_caption,
        ),
        caption_label: cn("text-sm font-medium text-foreground", classNames?.caption_label),
        nav: cn("absolute top-0 flex w-full justify-between gap-1", classNames?.nav),
        button_previous: cn(
          "inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
          classNames?.button_previous,
        ),
        button_next: cn(
          "inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
          classNames?.button_next,
        ),
        month_grid: cn("w-full border-collapse", classNames?.month_grid),
        weekdays: cn("flex", classNames?.weekdays),
        weekday: cn(
          "w-9 text-[0.8rem] font-normal text-muted-foreground",
          classNames?.weekday,
        ),
        week: cn("mt-2 flex w-full", classNames?.week),
        day: cn(
          "relative flex size-9 flex-1 items-center justify-center p-0 text-center text-sm focus-within:relative",
          classNames?.day,
        ),
        day_button: cn(
          "inline-flex size-9 items-center justify-center rounded-md p-0 font-normal text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-selected:opacity-100",
          classNames?.day_button,
        ),
        selected: cn("rounded-md", classNames?.selected),
        today: cn("font-semibold", classNames?.today),
        outside: cn("text-muted-foreground/70", classNames?.outside),
        disabled: cn("text-muted-foreground opacity-40", classNames?.disabled),
        range_middle: cn("rounded-none bg-muted/60", classNames?.range_middle),
        range_start: cn("rounded-e-none rounded-s-md", classNames?.range_start),
        range_end: cn("rounded-e-md rounded-s-none", classNames?.range_end),
        hidden: cn("invisible", classNames?.hidden),
      }}
      components={{
        Chevron: ({ className: chClass, orientation }) => {
          if (orientation === "left") {
            return <ChevronLeft className={cn("size-4", chClass)} />;
          }
          if (orientation === "right") {
            return <ChevronRight className={cn("size-4", chClass)} />;
          }
          return <ChevronDown className={cn("size-4", chClass)} />;
        },
      }}
      locale={es}
      weekStartsOn={1}
      timeZone="UTC"
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
