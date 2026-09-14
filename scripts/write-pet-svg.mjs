import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const petPhotoPath = path.resolve(__dirname, "..", "public", "assets", "images", "pet-photo.jpg");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff0f5"/>
      <stop offset="100%" stop-color="#f8d7e3"/>
    </linearGradient>
    <linearGradient id="ear" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bb6c87"/>
      <stop offset="100%" stop-color="#9d526d"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="100" fill="url(#bg)"/>
  <!-- Ears -->
  <ellipse cx="60" cy="65" rx="22" ry="32" transform="rotate(-20 60 65)" fill="url(#ear)"/>
  <ellipse cx="140" cy="65" rx="22" ry="32" transform="rotate(20 140 65)" fill="url(#ear)"/>
  <ellipse cx="60" cy="65" rx="14" ry="22" transform="rotate(-20 60 65)" fill="#fce4ec"/>
  <ellipse cx="140" cy="65" rx="14" ry="22" transform="rotate(20 140 65)" fill="#fce4ec"/>
  <!-- Face -->
  <circle cx="100" cy="115" r="55" fill="#ffffff"/>
  <!-- Eyes -->
  <ellipse cx="80" cy="108" rx="6" ry="8" fill="#47333f"/>
  <ellipse cx="120" cy="108" rx="6" ry="8" fill="#47333f"/>
  <circle cx="82" cy="105" r="2.5" fill="#ffffff"/>
  <circle cx="122" cy="105" r="2.5" fill="#ffffff"/>
  <!-- Cheeks -->
  <circle cx="70" cy="118" r="8" fill="#f8bbd0" opacity="0.7"/>
  <circle cx="130" cy="118" r="8" fill="#f8bbd0" opacity="0.7"/>
  <!-- Nose & Mouth -->
  <ellipse cx="100" cy="118" rx="5" ry="4" fill="#bb6c87"/>
  <path d="M95,123 Q100,128 100,123 Q100,128 105,123" fill="none" stroke="#bb6c87" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Heart on head -->
  <path d="M100,56 C95,50 87,54 87,60 C87,66 100,74 100,74 C100,74 113,66 113,60 C113,54 105,50 100,56 Z" fill="#d98aa1"/>
</svg>`;

fs.writeFileSync(petPhotoPath, Buffer.from(svg, "utf8"));
console.log("Wrote SVG pet illustration to", petPhotoPath);
