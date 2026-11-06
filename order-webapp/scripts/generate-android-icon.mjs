import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

// Reuse the PWA artwork: leaf mark, "Thực Phẩm" and "SỐ MỘT" together.
const webIcon = await readFile(new URL('../public/pwa-512x512.png', import.meta.url));
const webMaskableIcon = await readFile(new URL('../public/pwa-maskable-512x512.png', import.meta.url));
const root = new URL('../android/app/src/main/res/', import.meta.url);
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [density, scale] of Object.entries(densities)) {
  const dir = new URL(`mipmap-${density}/`, root);
  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);
  const launcher = await sharp(webIcon).resize(legacy, legacy).png().toBuffer();
  await writeFile(new URL('ic_launcher.png', dir), launcher);
  await writeFile(new URL('ic_launcher_round.png', dir), launcher);
  const insetSize = Math.round(adaptive * 0.8);
  const icon = await sharp(webMaskableIcon).resize(insetSize, insetSize).png().toBuffer();
  const foreground = await sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: '#00000000' } })
    .composite([{ input: icon, left: Math.floor((adaptive - insetSize) / 2), top: Math.floor((adaptive - insetSize) / 2) }]).png().toBuffer();
  await writeFile(new URL('ic_launcher_foreground.png', dir), foreground);
}
