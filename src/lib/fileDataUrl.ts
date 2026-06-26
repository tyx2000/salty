export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file."));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl: string, fileName: string, mimeType: string) {
  const separatorIndex = dataUrl.indexOf(",");
  if (separatorIndex < 0) throw new Error("Invalid attachment data URL.");

  const header = dataUrl.slice(0, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);
  const decoded = header.includes(";base64")
    ? atob(payload)
    : decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return new File([bytes], fileName, {
    type: mimeType || parseDataUrlMimeType(header) || "application/octet-stream",
  });
}

function parseDataUrlMimeType(header: string) {
  const match = /^data:([^;,]+)/.exec(header);
  return match?.[1] ?? "";
}
