function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sha256HexFromBytes(data: ArrayBuffer | Uint8Array): Promise<string> {
  const source: ArrayBuffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
  return bufferToHex(digest);
}

export async function sha256HexFromString(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  return sha256HexFromBytes(encoded);
}

export async function sha256HexFromFile(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256HexFromBytes(buffer);
}
