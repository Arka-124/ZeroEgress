/**
 * Zero-dependency POSIX UStar TAR archive encoder & decoder.
 * Works seamlessly in pure browser memory and Web Workers.
 */

export interface TarFileItem {
  name: string;
  data: Uint8Array;
  mtime?: number;
}

export interface TarEntry {
  name: string;
  size: number;
  data: Uint8Array;
  mtime: number;
  isDir: boolean;
}

/**
 * Creates a standard POSIX UStar TAR archive from a list of files.
 */
export function createTarArchive(files: TarFileItem[]): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];

  for (const file of files) {
    const sanitizedName = file.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const header = new Uint8Array(512);

    // 0..100: File name (up to 100 bytes)
    const nameBytes = enc.encode(sanitizedName);
    header.set(nameBytes.subarray(0, 100), 0);

    // 100..108: File mode (0000644\0)
    header.set(enc.encode('0000644\0'), 100);

    // 108..116: Owner UID (0000000\0)
    header.set(enc.encode('0000000\0'), 108);

    // 116..124: Group GID (0000000\0)
    header.set(enc.encode('0000000\0'), 116);

    // 124..136: Size in octal (11 octal digits + space/null)
    const sizeOctal = file.data.length.toString(8).padStart(11, '0') + ' ';
    header.set(enc.encode(sizeOctal), 124);

    // 136..148: Modification time in octal seconds
    const mtimeSec = Math.floor((file.mtime ?? Date.now()) / 1000);
    const mtimeOctal = mtimeSec.toString(8).padStart(11, '0') + ' ';
    header.set(enc.encode(mtimeOctal), 136);

    // 156: Typeflag ('0' = regular file)
    header[156] = 48; // '0'

    // 257..263: Magic ('ustar\0')
    header.set(enc.encode('ustar\0'), 257);

    // 263..265: Version ('00')
    header.set(enc.encode('00'), 263);

    // Compute checksum (148..156 treated as 8 spaces)
    for (let i = 148; i < 156; i++) {
      header[i] = 32; // ASCII space
    }
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.set(enc.encode(checksumOctal), 148);

    blocks.push(header);
    blocks.push(file.data);

    // Pad file content to 512-byte boundary
    const remainder = file.data.length % 512;
    if (remainder > 0) {
      blocks.push(new Uint8Array(512 - remainder));
    }
  }

  // End of archive: Two 512-byte zero blocks
  blocks.push(new Uint8Array(1024));

  const totalLength = blocks.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }

  return result;
}

/**
 * Parses a POSIX UStar TAR archive into individual file entries.
 */
export function parseTarArchive(buffer: Uint8Array): TarEntry[] {
  const dec = new TextDecoder();
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);

    // Check for end-of-archive zero block
    let isZeroBlock = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isZeroBlock = false;
        break;
      }
    }
    if (isZeroBlock) break;

    // Read file name (first 100 bytes or prefix + name if available)
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) {
      nameEnd++;
    }
    const name = dec.decode(header.subarray(0, nameEnd)).trim();
    if (!name) break;

    // Read size from octal string (bytes 124..136)
    const sizeStr = dec.decode(header.subarray(124, 136)).trim().replace(/\0.*/, '');
    const size = parseInt(sizeStr, 8) || 0;

    // Read mtime from octal string (bytes 136..148)
    const mtimeStr = dec.decode(header.subarray(136, 148)).trim().replace(/\0.*/, '');
    const mtimeSec = parseInt(mtimeStr, 8) || 0;
    const mtime = mtimeSec * 1000;

    // Read typeflag (byte 156)
    const typeflag = header[156];
    const isDir = typeflag === 53 || name.endsWith('/'); // '5' is directory

    offset += 512;

    if (offset + size > buffer.length) {
      break;
    }

    const fileData = buffer.slice(offset, offset + size);
    entries.push({
      name,
      size,
      data: fileData,
      mtime,
      isDir,
    });

    // Advance to next 512-byte boundary
    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}
