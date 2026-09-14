"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/**
 * next-themes, which has been a dependency since June and wired to nothing.
 *
 * `attribute="class"` because globals.css defines the dark palette under
 * `.dark` and Tailwind's dark variant is `&:is(.dark *)`. Dark is the default:
 * the desk has always looked like this and a light flash on every load for
 * people who never touch the toggle would be a regression dressed as a
 * feature. `enableSystem` lets a machine set to light start there.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
