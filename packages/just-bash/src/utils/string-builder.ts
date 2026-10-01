const STRING_CHUNK_SIZE = 8192;

/** Build strings in bounded batches to avoid long ropes of single-character appends. */
export function createStringBuilder(): {
  append: (value: string) => void;
  finish: () => string;
} {
  const parts: string[] = [];
  let chunk: string[] = [];

  return {
    append(value: string) {
      chunk.push(value);
      if (chunk.length >= STRING_CHUNK_SIZE) {
        parts.push(chunk.join(""));
        chunk = [];
      }
    },
    finish() {
      if (chunk.length > 0) parts.push(chunk.join(""));
      return parts.join("");
    },
  };
}
