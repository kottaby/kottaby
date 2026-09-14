import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as sharpModule from "sharp";

const sharp = sharpModule.default;

const svgPath = process.argv[2] || "public/favicon.svg";
const icoSizes = [16, 32, 48, 256];
const pngSizes = [
  { size: 512, filename: "icon.png" },
  { size: 180, filename: "apple-icon.png" },
];

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ICO container wrapping pre-rendered PNGs (Vista+ PNG-embedded entries):
// 6-byte header, then one 16-byte directory entry per image, then the blobs.
function buildIco(pngBuffers: Buffer[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  const directory = Buffer.alloc(pngBuffers.length * 16);
  let offset = header.length + directory.length;
  pngBuffers.forEach((png, index) => {
    const base = index * 16;
    const dimension = png.readUInt32BE(16); // IHDR width (big-endian); square icons
    const sizeByte = dimension >= 256 ? 0 : dimension; // 256 is encoded as 0
    directory.writeUInt8(sizeByte, base);
    directory.writeUInt8(sizeByte, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...pngBuffers]);
}

async function convertSvgToIco(svgBuffer: Buffer, outputDir: string): Promise<void> {
  const pngBuffers = await Promise.all(icoSizes.map(size => sharp(svgBuffer).resize(size, size).png().toBuffer()));
  const icoBuffer = buildIco(pngBuffers);
  const icoPath = resolve(outputDir, "favicon.ico");
  ensureDir(icoPath);
  writeFileSync(icoPath, icoBuffer);
  console.log(`Generated: ${icoPath}`);
}

async function convertSvgToPng(svgBuffer: Buffer, outputDir: string): Promise<void> {
  await Promise.all(
    pngSizes.map(async ({ size, filename }) => {
      const pngBuffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
      const pngPath = resolve(outputDir, filename);
      ensureDir(pngPath);
      writeFileSync(pngPath, pngBuffer);
      console.log(`Generated: ${pngPath}`);
    })
  );
}

export async function generateIcons(customSvgPath?: string): Promise<void> {
  const inputPath = customSvgPath ?? svgPath;
  const svgBuffer = readFileSync(inputPath);
  const appDir = resolve(process.cwd(), "app");

  await Promise.all([convertSvgToIco(svgBuffer, appDir), convertSvgToPng(svgBuffer, appDir)]);

  console.log("All icons generated successfully.");
}

if (import.meta.main) {
  void generateIcons();
}
