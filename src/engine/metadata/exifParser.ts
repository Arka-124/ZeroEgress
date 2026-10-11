import type { GpsCoordinates, MetadataInspectionReport, MetadataTag } from '../types';

/**
 * Pure client-side binary parser for EXIF, XMP, and container metadata.
 * Detects sensitive tags: GPS location, Camera make/model, Software signatures, and Timestamps.
 */
export async function parseFileMetadata(
  file: File | Blob,
  _fileName?: string
): Promise<MetadataInspectionReport> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const tags: MetadataTag[] = [];
  let gpsCoords: GpsCoordinates | undefined = undefined;
  let cameraInfo: { make?: string; model?: string; lens?: string } | undefined = undefined;
  let softwareInfo: string | undefined = undefined;
  let timestampInfo: string | undefined = undefined;
  let fileType: 'image' | 'pdf' | 'unknown' = 'unknown';

  // Check JPEG (0xFFD8)
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    fileType = 'image';
    parseJpegMetadata(view, tags);
  }
  // Check PNG (89 50 4E 47 0D 0A 1A 0A)
  else if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    fileType = 'image';
    parsePngMetadata(bytes, view, tags);
  }
  // Check WebP (RIFF .... WEBP)
  else if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    fileType = 'image';
    parseWebpMetadata(bytes, view, tags);
  }
  // Check PDF (%PDF)
  else if (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    fileType = 'pdf';
    await parsePdfMetadataQuick(buffer, tags);
  }

  // Aggregate high-level properties from tags
  for (const tag of tags) {
    if (tag.category === 'gps' && tag.raw?.coords) {
      gpsCoords = tag.raw.coords;
    }
    if (tag.category === 'camera') {
      if (!cameraInfo) cameraInfo = {};
      if (tag.key === 'Make') cameraInfo.make = tag.value;
      if (tag.key === 'Model') cameraInfo.model = tag.value;
      if (tag.key === 'LensModel') cameraInfo.lens = tag.value;
    }
    if (tag.category === 'software' && !softwareInfo) {
      softwareInfo = tag.value;
    }
    if (tag.category === 'timestamp' && !timestampInfo) {
      timestampInfo = tag.value;
    }
  }

  const hasSensitiveMetadata = tags.length > 0;

  return {
    fileType,
    hasSensitiveMetadata,
    totalTagsFound: tags.length,
    tags,
    gps: gpsCoords,
    camera: cameraInfo,
    software: softwareInfo,
    timestamp: timestampInfo,
  };
}

/**
 * Scan JPEG segments for APP1 (EXIF / XMP)
 */
function parseJpegMetadata(view: DataView, tags: MetadataTag[]): void {
  let offset = 2; // skip 0xFFD8
  const length = view.byteLength;

  while (offset + 4 < length) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }
    const marker = view.getUint8(offset + 1);

    // SOS (Start of Scan) or EOI (End of Image)
    if (marker === 0xda || marker === 0xd9) {
      break;
    }

    const segmentLength = view.getUint16(offset + 2);

    // APP1 Marker (EXIF or XMP)
    if (marker === 0xe1) {
      // Check for Exif\0\0 header
      if (offset + 10 < length) {
        const header = String.fromCharCode(
          view.getUint8(offset + 4),
          view.getUint8(offset + 5),
          view.getUint8(offset + 6),
          view.getUint8(offset + 7)
        );
        if (header === 'Exif' && view.getUint16(offset + 8) === 0x0000) {
          parseTiffBlock(view, offset + 10, tags);
        } else if (header === 'http') {
          // XMP metadata packet
          tags.push({
            category: 'software',
            key: 'XMP',
            label: 'Adobe XMP Metadata Packet',
            value: 'Present in APP1 segment',
          });
        }
      }
    }
    // APP13 Marker (IPTC)
    else if (marker === 0xed) {
      tags.push({
        category: 'other',
        key: 'IPTC',
        label: 'IPTC / Photoshop Record',
        value: `APP13 segment (${segmentLength} bytes)`,
      });
    }
    // COM Marker (Comment)
    else if (marker === 0xfe) {
      const commentBytes = new Uint8Array(view.buffer, offset + 4, segmentLength - 2);
      const comment = new TextDecoder().decode(commentBytes);
      tags.push({
        category: 'other',
        key: 'Comment',
        label: 'Embedded User Comment',
        value: comment,
      });
    }

    offset += 2 + segmentLength;
  }
}

/**
 * Parse TIFF block inside EXIF payload
 */
function parseTiffBlock(view: DataView, tiffOffset: number, tags: MetadataTag[]): void {
  if (tiffOffset + 8 > view.byteLength) return;

  const byteOrder = view.getUint16(tiffOffset);
  const littleEndian = byteOrder === 0x4949; // 'II' = Intel = Little Endian
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return;

  const test42 = view.getUint16(tiffOffset + 2, littleEndian);
  if (test42 !== 0x002a) return;

  const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
  let exifIfdOffset: number | undefined;
  let gpsIfdOffset: number | undefined;

  // Read IFD0
  readIfd(view, tiffOffset, tiffOffset + firstIfdOffset, littleEndian, tags, (tagId, val) => {
    if (tagId === 0x8769) exifIfdOffset = val; // Exif SubIFD
    if (tagId === 0x8825) gpsIfdOffset = val; // GPS SubIFD
  });

  // Read Exif SubIFD
  if (exifIfdOffset && tiffOffset + exifIfdOffset < view.byteLength) {
    readIfd(view, tiffOffset, tiffOffset + exifIfdOffset, littleEndian, tags);
  }

  // Read GPS SubIFD
  if (gpsIfdOffset && tiffOffset + gpsIfdOffset < view.byteLength) {
    readGpsIfd(view, tiffOffset, tiffOffset + gpsIfdOffset, littleEndian, tags);
  }
}

/**
 * Read generic IFD directory
 */
function readIfd(
  view: DataView,
  tiffBase: number,
  ifdOffset: number,
  littleEndian: boolean,
  tags: MetadataTag[],
  onPointer?: (tagId: number, val: number) => void
): void {
  if (ifdOffset + 2 > view.byteLength) return;
  const numEntries = view.getUint16(ifdOffset, littleEndian);
  let curOffset = ifdOffset + 2;

  for (let i = 0; i < numEntries; i++) {
    if (curOffset + 12 > view.byteLength) break;

    const tagId = view.getUint16(curOffset, littleEndian);
    const type = view.getUint16(curOffset + 2, littleEndian);
    const count = view.getUint32(curOffset + 4, littleEndian);
    const valOrOffset = view.getUint32(curOffset + 8, littleEndian);

    if (onPointer) {
      onPointer(tagId, valOrOffset);
    }

    // Process recognized tags
    handleKnownTag(view, tiffBase, tagId, type, count, curOffset + 8, littleEndian, tags);
    curOffset += 12;
  }
}

function handleKnownTag(
  view: DataView,
  tiffBase: number,
  tagId: number,
  _type: number,
  count: number,
  valFieldOffset: number,
  littleEndian: boolean,
  tags: MetadataTag[]
): void {
  const readString = (): string => {
    const stringOffset = count <= 4 ? valFieldOffset : tiffBase + view.getUint32(valFieldOffset, littleEndian);
    if (stringOffset + count > view.byteLength) return '';
    const bytes = new Uint8Array(view.buffer, stringOffset, Math.min(count, 128));
    return new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
  };

  switch (tagId) {
    case 0x010f: // Make
      tags.push({ category: 'camera', key: 'Make', label: 'Device Manufacturer', value: readString() });
      break;
    case 0x0110: // Model
      tags.push({ category: 'camera', key: 'Model', label: 'Camera / Device Model', value: readString() });
      break;
    case 0x0131: // Software
      tags.push({ category: 'software', key: 'Software', label: 'Firmware / Editing Software', value: readString() });
      break;
    case 0x0132: // DateTime
      tags.push({ category: 'timestamp', key: 'DateTime', label: 'Modification Timestamp', value: readString() });
      break;
    case 0x9003: // DateTimeOriginal
      tags.push({ category: 'timestamp', key: 'DateTimeOriginal', label: 'Original Capture Timestamp', value: readString() });
      break;
    case 0x9004: // DateTimeDigitized
      tags.push({ category: 'timestamp', key: 'DateTimeDigitized', label: 'Digitization Timestamp', value: readString() });
      break;
    case 0xa434: // LensModel
      tags.push({ category: 'camera', key: 'LensModel', label: 'Lens Specification', value: readString() });
      break;
  }
}

/**
 * Read GPS IFD and convert degrees/minutes/seconds to decimal degrees
 */
function readGpsIfd(
  view: DataView,
  tiffBase: number,
  ifdOffset: number,
  littleEndian: boolean,
  tags: MetadataTag[]
): void {
  if (ifdOffset + 2 > view.byteLength) return;
  const numEntries = view.getUint16(ifdOffset, littleEndian);
  let curOffset = ifdOffset + 2;

  let latRef = 'N';
  let lonRef = 'E';
  let latVals: number[] | null = null;
  let lonVals: number[] | null = null;
  let altitude: number | undefined;

  for (let i = 0; i < numEntries; i++) {
    if (curOffset + 12 > view.byteLength) break;
    const tagId = view.getUint16(curOffset, littleEndian);
    const valOffset = view.getUint32(curOffset + 8, littleEndian);

    if (tagId === 0x0001) {
      // GPSLatitudeRef
      latRef = String.fromCharCode(view.getUint8(curOffset + 8)).toUpperCase();
    } else if (tagId === 0x0003) {
      // GPSLongitudeRef
      lonRef = String.fromCharCode(view.getUint8(curOffset + 8)).toUpperCase();
    } else if (tagId === 0x0002) {
      // GPSLatitude
      latVals = readRationals(view, tiffBase + valOffset, 3, littleEndian);
    } else if (tagId === 0x0004) {
      // GPSLongitude
      lonVals = readRationals(view, tiffBase + valOffset, 3, littleEndian);
    } else if (tagId === 0x0006) {
      // GPSAltitude
      const r = readRationals(view, tiffBase + valOffset, 1, littleEndian);
      if (r && r.length > 0) altitude = r[0];
    }

    curOffset += 12;
  }

  if (latVals && lonVals && latVals.length === 3 && lonVals.length === 3) {
    let lat = latVals[0] + latVals[1] / 60 + latVals[2] / 3600;
    if (latRef === 'S') lat = -lat;

    let lon = lonVals[0] + lonVals[1] / 60 + lonVals[2] / 3600;
    if (lonRef === 'W') lon = -lon;

    const coords: GpsCoordinates = {
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lon.toFixed(6)),
      altitude: altitude ? parseFloat(altitude.toFixed(1)) : undefined,
      formattedDMS: `${Math.abs(latVals[0])}°${latVals[1]}'${latVals[2].toFixed(1)}" ${latRef}, ${Math.abs(lonVals[0])}°${lonVals[1]}'${lonVals[2].toFixed(1)}" ${lonRef}`,
    };

    tags.push({
      category: 'gps',
      key: 'GPSCoordinates',
      label: 'Exact GPS Location Coordinates',
      value: `${coords.latitude}, ${coords.longitude} (${coords.formattedDMS})`,
      raw: { coords },
    });
  }
}

function readRationals(view: DataView, offset: number, count: number, littleEndian: boolean): number[] | null {
  if (offset + count * 8 > view.byteLength) return null;
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    const num = view.getUint32(offset + i * 8, littleEndian);
    const den = view.getUint32(offset + i * 8 + 4, littleEndian);
    results.push(den === 0 ? 0 : num / den);
  }
  return results;
}

/**
 * Read PNG chunks for tEXt, zTXt, iTXt, eXIf
 */
function parsePngMetadata(bytes: Uint8Array, view: DataView, tags: MetadataTag[]): void {
  let offset = 8; // skip PNG signature
  while (offset + 8 < bytes.length) {
    const chunkLength = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (chunkType === 'eXIf') {
      tags.push({
        category: 'camera',
        key: 'eXIf',
        label: 'PNG Embedded EXIF Profile',
        value: `eXIf Chunk (${chunkLength} bytes)`,
      });
      // Try parsing inner TIFF payload
      try {
        const subView = new DataView(view.buffer, offset + 8, chunkLength);
        parseTiffBlock(subView, 0, tags);
      } catch {
        // Continue
      }
    } else if (chunkType === 'tEXt' || chunkType === 'iTXt') {
      const chunkData = bytes.slice(offset + 8, offset + 8 + chunkLength);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx !== -1) {
        const keyword = new TextDecoder().decode(chunkData.slice(0, nullIdx));
        const val = new TextDecoder().decode(chunkData.slice(nullIdx + 1)).trim();
        tags.push({
          category: keyword.toLowerCase().includes('software') ? 'software' : 'other',
          key: keyword,
          label: `PNG Text Field: ${keyword}`,
          value: val.substring(0, 150),
        });
      }
    } else if (chunkType === 'tIME') {
      tags.push({
        category: 'timestamp',
        key: 'tIME',
        label: 'PNG Creation / Modification Time',
        value: 'tIME chunk present',
      });
    }

    offset += 12 + chunkLength;
    if (chunkType === 'IEND') break;
  }
}

/**
 * Scan WebP chunks for EXIF and XMP
 */
function parseWebpMetadata(bytes: Uint8Array, view: DataView, tags: MetadataTag[]): void {
  let offset = 12; // skip RIFF + WEBP
  while (offset + 8 < bytes.length) {
    const fourCC = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (fourCC === 'EXIF') {
      tags.push({
        category: 'camera',
        key: 'WebP_EXIF',
        label: 'WebP Embedded EXIF Chunk',
        value: `Size: ${chunkSize} bytes`,
      });
      try {
        const subView = new DataView(view.buffer, offset + 8, chunkSize);
        parseTiffBlock(subView, 0, tags);
      } catch {
        // Ignore
      }
    } else if (fourCC === 'XMP ') {
      tags.push({
        category: 'software',
        key: 'WebP_XMP',
        label: 'WebP Extensible Metadata (XMP)',
        value: `Size: ${chunkSize} bytes`,
      });
    }

    // WebP chunks are padded to 2 bytes
    offset += 8 + chunkSize + (chunkSize % 2);
  }
}

/**
 * Quick PDF metadata inspection using string scanning
 */
async function parsePdfMetadataQuick(buffer: ArrayBuffer, tags: MetadataTag[]): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const title = pdf.getTitle();
    const author = pdf.getAuthor();
    const subject = pdf.getSubject();
    const creator = pdf.getCreator();
    const producer = pdf.getProducer();
    const creationDate = pdf.getCreationDate();
    const modDate = pdf.getModificationDate();

    if (title) tags.push({ category: 'document', key: 'Title', label: 'Document Title', value: title });
    if (author) tags.push({ category: 'document', key: 'Author', label: 'Document Author', value: author });
    if (subject) tags.push({ category: 'document', key: 'Subject', label: 'Document Subject', value: subject });
    if (creator) tags.push({ category: 'software', key: 'Creator', label: 'PDF Creator Application', value: creator });
    if (producer) tags.push({ category: 'software', key: 'Producer', label: 'PDF Producer Software', value: producer });
    if (creationDate) tags.push({ category: 'timestamp', key: 'CreationDate', label: 'Creation Timestamp', value: creationDate.toISOString() });
    if (modDate) tags.push({ category: 'timestamp', key: 'ModDate', label: 'Modification Timestamp', value: modDate.toISOString() });
  } catch {
    // If encrypted or malformed
  }
}
