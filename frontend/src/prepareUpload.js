// Pull the chat text out of an export of any size, entirely in the browser.
//
// WhatsApp and Meta exports are mostly photos, videos and voice notes. ZipReader
// reads a File lazily with slices, so a multi-gigabyte archive never has to fit
// in memory: only its directory and the chat text entries are read. Those
// entries are recompressed into a small ZIP, which is all that is uploaded.
import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter,
  configure,
} from "@zip.js/zip.js";

configure({ useWebWorkers: false });

// Keep in step with MAX_EXPANDED and MAX_BYTES in backend/parser.py.
export const MAX_TEXT_BYTES = 256 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 128 * 1024 * 1024;
const TEXT = /\.(txt|json|csv)$/i;
const ZIP = /\.zip$/i;
const BACKUP = /\.crypt\d+$|\.db(\.\w+)?$|msgstore/i;

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

async function isZip(file) {
  if (ZIP.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
}

const isChatEntry = (entry) =>
  !entry.directory &&
  TEXT.test(entry.filename) &&
  !entry.filename
    .split("/")
    .some((part) => part.startsWith(".") || part === "__MACOSX");

const tooMuchText = () =>
  new Error(
    "This chat has more than 256 MB of text, which is more than one report can hold. Export a shorter date range.",
  );

/**
 * Returns a ZIP File holding only the export's chat text, named like the
 * original, plus the sizes shown to the user.
 * onProgress receives a fraction between 0 and 1.
 */
export async function prepareUpload(file, onProgress = () => {}) {
  if (BACKUP.test(file.name))
    throw new Error(
      "That's an encrypted app backup, which only the app itself can open. Export the chat instead: More → Export chat → Without media.",
    );
  const zip = await isZip(file);
  if (!zip && !TEXT.test(file.name))
    throw new Error("Choose a .txt, .zip, .json or .csv chat export.");
  if (file.size === 0) throw new Error("This file is empty.");

  const writer = new ZipWriter(new BlobWriter("application/zip"), {
    level: 6,
  });
  let textBytes = 0;
  let mediaFiles = 0;
  if (zip) {
    let reader;
    try {
      reader = new ZipReader(new BlobReader(file));
      const entries = await reader.getEntries();
      const chats = entries.filter(isChatEntry);
      if (!chats.length) {
        const found = entries.filter((e) => !e.directory).length;
        throw new Error(
          found
            ? `This archive holds no chat text file (it has ${found.toLocaleString()} other files). Export the chat again and choose Without media, or upload the .txt inside.`
            : "This ZIP is empty. Export the chat again and wait for the download to finish.",
        );
      }
      mediaFiles = entries.filter((e) => !e.directory && !isChatEntry(e)).length;
      if (chats.some((e) => e.encrypted))
        throw new Error("Password-protected ZIP files are not supported.");
      textBytes = chats.reduce((sum, e) => sum + e.uncompressedSize, 0);
      if (textBytes > MAX_TEXT_BYTES) throw tooMuchText();
      let done = 0;
      for (const entry of chats) {
        const data = await entry.getData(new BlobWriter(), {
          onprogress: (value) =>
            onProgress((done + value / 2) / Math.max(textBytes, 1)),
        });
        await writer.add(entry.filename, new BlobReader(data), {
          onprogress: (value) =>
            onProgress(
              (done + entry.uncompressedSize / 2 + value / 2) /
                Math.max(textBytes, 1),
            ),
        });
        done += entry.uncompressedSize;
      }
    } catch (err) {
      await writer.close().catch(() => {});
      if (err.message?.startsWith?.("File format is not recognized"))
        throw new Error(
          "That file looks damaged. Re-export the chat and make sure it finished downloading before you upload it.",
        );
      throw err;
    } finally {
      await reader?.close().catch(() => {});
    }
  } else {
    textBytes = file.size;
    if (textBytes > MAX_TEXT_BYTES) throw tooMuchText();
    await writer.add(file.name, new BlobReader(file), {
      onprogress: (value, total) => onProgress(value / Math.max(total, 1)),
    });
  }
  const blob = await writer.close();
  if (blob.size > MAX_UPLOAD_BYTES) throw tooMuchText();
  onProgress(1);
  const upload = new File([blob], file.name, { type: "application/zip" });
  return { upload, originalSize: file.size, textBytes, mediaFiles };
}
