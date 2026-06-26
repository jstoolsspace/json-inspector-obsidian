/**
 * Clipboard helper. Uses the async Clipboard API when available and falls back
 * to a hidden textarea for older Obsidian/Electron builds.
 *
 * No note content is ever logged; failures are reported via the returned
 * boolean only.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const doc = activeDocument;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.setCssStyles({ position: "fixed", opacity: "0", pointerEvents: "none" });
    doc.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = doc.execCommand("copy");
    doc.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
