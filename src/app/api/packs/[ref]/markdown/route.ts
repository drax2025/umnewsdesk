import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/packs/[ref]/markdown
 *
 * Returns the canonical 12-section pack archive (rendered by renderPack).
 * Editor + senior_editor gated. The DB copy is authoritative — the on-disk
 * `workspace/pre_publish_packs/<REF>.md` is only present in dev.
 *
 * Query string `?download=1` switches the Content-Disposition to attachment
 * so the browser saves rather than displays.
 */

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (me?.role !== "editor" && me?.role !== "senior_editor") {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  const { ref } = await params;
  if (!ref) {
    return NextResponse.json({ error: "Missing pack ref" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: pack } = await admin
    .from("pre_publish_packs")
    .select("pack_ref, archive_markdown, archive_signature, rendered_at")
    .eq("pack_ref", ref)
    .maybeSingle<{
      pack_ref: string;
      archive_markdown: string | null;
      archive_signature: string | null;
      rendered_at: string | null;
    }>();

  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }
  if (!pack.archive_markdown) {
    return NextResponse.json(
      {
        error:
          "Pack has not been rendered yet. Trigger 'Render pack' from the F9 panel.",
      },
      { status: 409 },
    );
  }

  const url = new URL(req.url);
  const download = url.searchParams.get("download");
  const filename = `${pack.pack_ref}.md`;

  return new NextResponse(pack.archive_markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition":
        download === "1"
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
      "X-Pack-Signature": pack.archive_signature ?? "",
      "X-Pack-Rendered-At": pack.rendered_at ?? "",
      "Cache-Control": "no-store",
    },
  });
}
