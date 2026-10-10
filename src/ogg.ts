// every clip is mono Opus at 48kHz in an Ogg container (RFC 7845): the upload
// form encodes it and the server only accepts it
const SAMPLE_RATE = 48000;
// libopus' lookahead at 48kHz, which the decoder skips at the start
const PRE_SKIP = 312;
const PAGE_HEADER_BYTES = 27;
// what the encoder is configured to, so each page's granule is known
const FRAME_SAMPLES = 960;
const FRAME_DURATION_US = (FRAME_SAMPLES / SAMPLE_RATE) * 1_000_000;

const textBytes = (value: string) => new TextEncoder().encode(value);

const readText = (data: Uint8Array, offset: number, length: number) =>
  new TextDecoder().decode(data.subarray(offset, offset + length));

const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let crc = i << 24;

  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }

  return crc >>> 0;
});

/** Ogg's CRC-32, taken with the page's own checksum field as zeroes. */
const getPageCrc = (page: Uint8Array) => {
  let crc = 0;

  page.forEach((byte, i) => {
    const value = i >= 22 && i < 26 ? 0 : byte;

    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ value) & 0xff]!) >>> 0;
  });

  return crc;
};

type TPage = {
  packet: Uint8Array;
  granule: number;
  flags: number;
};

const writePage = ({ packet, granule, flags }: TPage, sequence: number) => {
  // a packet is cut into 255 byte segments, and one shorter than 255 (even
  // empty) says where it ends
  const segments = Math.floor(packet.length / 255) + 1;
  const page = new Uint8Array(PAGE_HEADER_BYTES + segments + packet.length);
  const view = new DataView(page.buffer);

  page.set(textBytes("OggS"));
  page[5] = flags;
  view.setBigUint64(6, BigInt(granule), true);
  view.setUint32(14, 1, true); // stream serial, one stream per file
  view.setUint32(18, sequence, true);
  page[26] = segments;
  page.fill(255, PAGE_HEADER_BYTES, PAGE_HEADER_BYTES + segments - 1);
  page[PAGE_HEADER_BYTES + segments - 1] = packet.length % 255;
  page.set(packet, PAGE_HEADER_BYTES + segments);
  view.setUint32(22, getPageCrc(page), true);

  return page;
};

/**
 * Wraps the encoder's packets, `sampleCount` samples of sound in all, into an
 * Ogg Opus file. One packet per page: a little overhead for a lot less code.
 */
const muxOggOpus = (packets: Uint8Array[], sampleCount: number): Blob => {
  const head = new Uint8Array(19);
  const headView = new DataView(head.buffer);

  head.set(textBytes("OpusHead"));
  head[8] = 1; // version
  head[9] = 1; // mono
  headView.setUint16(10, PRE_SKIP, true);
  headView.setUint32(12, SAMPLE_RATE, true);

  const vendor = textBytes("soundboard");
  const tags = new Uint8Array(16 + vendor.length);

  tags.set(textBytes("OpusTags"));
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);

  const pages: TPage[] = [
    { packet: head, granule: 0, flags: 0x02 },
    { packet: tags, granule: 0, flags: 0 },
    ...packets.map((packet, i) => ({
      packet,
      // the last page's granule is what trims the encoder's padding off
      granule:
        i === packets.length - 1
          ? PRE_SKIP + sampleCount
          : PRE_SKIP + Math.min(sampleCount, (i + 1) * FRAME_SAMPLES),
      flags: i === packets.length - 1 ? 0x04 : 0,
    })),
  ];

  return new Blob(pages.map(writePage), { type: "audio/ogg" });
};

/** Throws unless `data` is a complete, mono Ogg Opus file. */
const getOggOpusDurationMs = (data: Uint8Array): number => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  let pageCount = 0;
  let preSkip = 0;
  let granule = 0n;

  while (offset < data.length) {
    if (
      offset + PAGE_HEADER_BYTES > data.length ||
      readText(data, offset, 4) !== "OggS"
    ) {
      throw new Error("The file is not an Ogg Opus file.");
    }

    const segments = data[offset + 26]!;
    const bodyOffset = offset + PAGE_HEADER_BYTES + segments;
    const bodyLength = data
      .subarray(offset + PAGE_HEADER_BYTES, bodyOffset)
      .reduce((sum, segment) => sum + segment, 0);
    const pageEnd = bodyOffset + bodyLength;

    if (pageEnd > data.length) throw new Error("The file is incomplete.");

    if (view.getUint32(offset + 22, true) !== getPageCrc(data.subarray(offset, pageEnd))) {
      throw new Error("The file is corrupted.");
    }

    if (pageCount === 0) {
      if (readText(data, bodyOffset, 8) !== "OpusHead" || data[bodyOffset + 9] !== 1) {
        throw new Error("The file must be mono Opus.");
      }

      preSkip = view.getUint16(bodyOffset + 10, true);
    }

    granule = view.getBigUint64(offset + 6, true);
    offset = pageEnd;
    pageCount++;
  }

  // the head and the tags come first, so a file of sound has a third page
  if (pageCount < 3) throw new Error("The file has no audio.");

  // ponytail: trusts the last granule for the length, which is what players
  // honor too. The upload size cap bounds a file that lies about it.
  return (Number(granule - BigInt(preSkip)) / SAMPLE_RATE) * 1000;
};

export { FRAME_DURATION_US, SAMPLE_RATE, getOggOpusDurationMs, muxOggOpus };
