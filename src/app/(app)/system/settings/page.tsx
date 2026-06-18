import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLoginWallpaper } from "@/lib/branding";
import { LoginWallpaperEditor } from "@/components/forms/login-wallpaper-editor";

export const dynamic = "force-dynamic";

/**
 * /system/settings — app-wide settings. Senior-Editor only (gated here and in
 * every branding action). Currently houses the custom login-screen wallpaper.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (meRow?.role !== "senior_editor") {
    redirect("/");
  }

  const wallpaper = await getLoginWallpaper();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Settings className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Settings</span>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-um-muted">
          Senior Editor
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-[640px] space-y-5">
          <div>
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              Appearance
            </h1>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-um-muted">
              Branding shown across the newsroom. Changes here are global and
              take effect immediately.
            </p>
          </div>

          <LoginWallpaperEditor
            initialUrl={wallpaper.url}
            initialOverlay={wallpaper.overlay}
          />
        </div>
      </div>
    </div>
  );
}
