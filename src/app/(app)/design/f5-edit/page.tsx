/**
 * F5 Edit screen — design preview.
 *
 * Hosts the static HTML mock (public/design/f5-edit-v3.html) inside an iframe
 * so the app shell (sidebar, topbar) stays visible while we evaluate the
 * design. The static HTML brings its own internal shell — we crop it to the
 * working pane only via the iframe's full-bleed sizing.
 *
 * This is a throwaway preview. When we port the F5 screen to a real Next
 * route under /articles/[id]/editorial, this file goes away.
 */

export const metadata = { title: "F5 Edit (preview)" };

export default function F5PreviewPage() {
  // The (app) layout reserves 48px for the topbar; fill what's left.
  return (
    <div className="h-[calc(100vh-48px)] overflow-hidden">
      <iframe
        src="/design/f5-edit-v3.html"
        title="F5 Edit design preview"
        className="h-full w-full border-0"
      />
    </div>
  );
}
