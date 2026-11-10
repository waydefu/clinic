// UTF-16 code units: even a chunk extended by one code unit remains well
// below Firestore's 1 MiB document limit after UTF-8 encoding.
const CHUNK_CHARACTERS = 200_000;

export function businessExportChunkCount(csv: string): number {
  return Math.max(1, Math.ceil(csv.length / CHUNK_CHARACTERS));
}

export function splitBusinessExportChunks(csv: string): string[] {
  const chunkCount = businessExportChunkCount(csv);
  const boundary = (index: number): number => {
    const offset = Math.min(index * CHUNK_CHARACTERS, csv.length);
    const previous = csv.charCodeAt(offset - 1);
    const next = csv.charCodeAt(offset);
    return previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff
      ? offset - 1
      : offset;
  };
  return Array.from({ length: chunkCount }, (_, index) =>
    csv.slice(boundary(index), boundary(index + 1))
  );
}
