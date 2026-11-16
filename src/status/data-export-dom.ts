// The « Exporter mes données » button bound to the page: it reads the storage (read-only, no site is
// contacted) and hands the file to a download port. No logic of its own.

import { exportFileName, exportText } from "./data-export";

export const EXPORT_FAILED = "L’export a échoué. Réessaie dans un instant.";

export type ExportStorage = {
  get(keys: null): Promise<Record<string, unknown>>;
};

type ButtonLike = { addEventListener(type: "click", fn: () => void): void };
export type ExportDoc = { getElementById(id: string): ButtonLike | null };

export function mountExport(
  doc: ExportDoc,
  storage: ExportStorage,
  download: (name: string, text: string) => void,
  version: string,
  note: (text: string) => void,
  now: () => Date = () => new Date(),
): void {
  const button = doc.getElementById("export");
  if (button === null) throw new Error("status.html: missing #export");
  button.addEventListener("click", () => {
    note("");
    void storage
      .get(null)
      .then((stored) => {
        const at = now();
        download(exportFileName(at), exportText(stored, version, at));
      })
      .catch(() => note(EXPORT_FAILED));
  });
}

// The download itself: a temporary link on a Blob URL, revoked once clicked.
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
