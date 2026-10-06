import { AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";

/**
 * Saving a file the user keeps (exports). Web: a download. Where the Web Share API can share
 * files (Android WebView, mobile browsers) the share sheet is offered first, because a plain
 * download does nothing inside an app WebView. Phase 3 can swap in @capacitor/filesystem
 * behind this same function.
 */
export async function saveTextFile(file: {
  fileName: string;
  mimeType: string;
  content: string;
}): Promise<Result<"shared" | "downloaded" | "cancelled", AppError>> {
  try {
    const blob = new Blob([file.content], { type: `${file.mimeType};charset=utf-8` });
    const shareable = new File([blob], file.fileName, { type: file.mimeType });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [shareable] })) {
      try {
        await navigator.share({ files: [shareable], title: file.fileName });
        return ok("shared");
      } catch (error) {
        // The user closed the share sheet: not a failure, nothing to report.
        if (error instanceof DOMException && error.name === "AbortError") return ok("cancelled");
        // Sharing refused for another reason: fall through to a plain download.
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      // Revoke after the click has been handled; revoking synchronously can cancel it.
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
    return ok("downloaded");
  } catch (cause) {
    return err(new AppError("RR-EXP-001", { cause }));
  }
}

/** Copies text to the clipboard. Returns false when the platform refuses (no permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard is best-effort (blocked permission, insecure context); callers show a message.
    return false;
  }
}
