import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const imagesDir = path.join(root, "public", "assets", "images");
const audioDir = path.join(root, "public", "assets", "audio");

fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

const petPhotoPath = path.join(imagesDir, "pet-photo.jpg");
const audioPath = path.join(audioDir, "background.mp3");

// Minimal valid 1x1 JPEG (pink-ish / standard JFIF)
const minimalJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

if (!fs.existsSync(petPhotoPath)) {
  fs.writeFileSync(petPhotoPath, minimalJpeg);
  console.log("Created placeholder:", petPhotoPath);
}

// Silent MP3 header frame
const silentMp3 = Buffer.from(
  "//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAFAAAA8AA=",
  "base64"
);

if (!fs.existsSync(audioPath)) {
  fs.writeFileSync(audioPath, silentMp3);
  console.log("Created placeholder:", audioPath);
}

console.log("Placeholders setup complete.");

