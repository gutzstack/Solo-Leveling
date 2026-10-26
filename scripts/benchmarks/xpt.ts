/**
 * Minimal reader for SAS Transport (XPORT) version 5 files, the format NHANES publishes.
 * Spec: "Record Layout of a SAS Version 5 or 6 Data Set in SAS Transport (XPORT) Format" (SAS TS-140).
 */

export interface XptVariable {
  name: string;
  label: string;
  type: "numeric" | "char";
  length: number;
  position: number;
}

export interface XptDataset {
  name: string;
  label: string;
  created: string;
  variables: XptVariable[];
  rows: Record<string, number | string | null>[];
}

const REC = 80;

function ascii(buf: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function u16(buf: Uint8Array, o: number): number {
  return (buf[o] << 8) | buf[o + 1];
}

function u32(buf: Uint8Array, o: number): number {
  return ((buf[o] << 24) >>> 0) + (buf[o + 1] << 16) + (buf[o + 2] << 8) + buf[o + 3];
}

/** IBM System/360 hexadecimal floating point (big-endian, up to 8 bytes) → JS number; SAS missing → null. */
export function ibmToNumber(bytes: Uint8Array): number | null {
  const b = new Uint8Array(8);
  b.set(bytes.subarray(0, Math.min(8, bytes.length)));
  let restZero = true;
  for (let i = 1; i < 8; i++) if (b[i] !== 0) restZero = false;
  if (restZero) {
    const c = b[0];
    // SAS missing values: '.', '_', 'A'..'Z'
    if (c === 0x2e || c === 0x5f || (c >= 0x41 && c <= 0x5a)) return null;
    if (c === 0) return 0;
  }
  const sign = b[0] & 0x80 ? -1 : 1;
  const exponent = (b[0] & 0x7f) - 64;
  const hi = (b[1] << 16) | (b[2] << 8) | b[3];
  const lo = u32(b, 4);
  const mantissa = hi * 2 ** 32 + lo; // 56 bits
  if (mantissa === 0) return 0;
  return sign * (mantissa / 2 ** 56) * Math.pow(16, exponent);
}

export function parseXpt(buf: Uint8Array): XptDataset {
  const header = ascii(buf, 0, REC);
  if (!header.startsWith("HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!")) {
    throw new Error("not a SAS XPORT v5 file (missing library header)");
  }
  let off = 3 * REC; // library header + 2 real-header records
  const member = ascii(buf, off, off + REC);
  if (!member.startsWith("HEADER RECORD*******MEMBER  HEADER RECORD")) throw new Error("missing member header");
  const namestrLen = Number(member.slice(75, 79));
  if (namestrLen !== 140 && namestrLen !== 136) throw new Error(`unsupported namestr length ${namestrLen}`);
  off += REC; // member header
  off += REC; // descriptor header
  const dsRec = ascii(buf, off, off + REC);
  const name = dsRec.slice(8, 16).trim();
  const created = ascii(buf, off + REC, off + REC + 16).trim();
  const label = ascii(buf, off + REC, off + 2 * REC).slice(32, 72).trim();
  off += 2 * REC;
  const nsHeader = ascii(buf, off, off + REC);
  if (!nsHeader.startsWith("HEADER RECORD*******NAMESTR HEADER RECORD")) throw new Error("missing namestr header");
  const nvars = Number(nsHeader.slice(54, 58));
  off += REC;
  const variables: XptVariable[] = [];
  for (let i = 0; i < nvars; i++) {
    const o = off + i * namestrLen;
    variables.push({
      type: u16(buf, o) === 1 ? "numeric" : "char",
      length: u16(buf, o + 4),
      name: ascii(buf, o + 8, o + 16).trim(),
      label: ascii(buf, o + 16, o + 56).trim(),
      position: u32(buf, o + 84),
    });
  }
  off += Math.ceil((nvars * namestrLen) / REC) * REC;
  const obsHeader = ascii(buf, off, off + REC);
  if (!obsHeader.startsWith("HEADER RECORD*******OBS     HEADER RECORD")) throw new Error("missing observation header");
  off += REC;
  const rowLen = variables.reduce((m, v) => Math.max(m, v.position + v.length), 0);
  const rows: Record<string, number | string | null>[] = [];
  for (let o = off; o + rowLen <= buf.length; o += rowLen) {
    // Trailing padding is filled with ASCII blanks.
    let allBlank = true;
    for (let i = o; i < o + rowLen; i++) {
      if (buf[i] !== 0x20) {
        allBlank = false;
        break;
      }
    }
    if (allBlank) break;
    const row: Record<string, number | string | null> = {};
    for (const v of variables) {
      const start = o + v.position;
      if (v.type === "numeric") row[v.name] = ibmToNumber(buf.subarray(start, start + v.length));
      else row[v.name] = ascii(buf, start, start + v.length).trimEnd();
    }
    rows.push(row);
  }
  return { name, label, created, variables, rows };
}
