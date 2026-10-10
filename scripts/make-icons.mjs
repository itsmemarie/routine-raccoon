// Builds the install icons (web manifest, Apple touch icon, favicon) from the logo.
// Run: node scripts/make-icons.mjs [path/to/logo.png]
// Re-run it with a bigger source (512 px or more, square) for sharper icons.
import sharp from "sharp";

const SOURCE = process.argv[2] ?? "public/icons/routine-raccoon-logo.png";
const OUT = "public/icons";
/** The logo's own red, so a full-bleed background meets its edge without a seam. */
const BRAND_RED = { r: 218, g: 11, b: 63 };
/** Maskable icons must keep the art inside the central 80 % circle (with a little air). */
const MASKABLE_SAFE_DIAMETER = 0.76;
/** Apple rounds the corners itself, so the art can be a bit bigger there. */
const APPLE_SAFE_DIAMETER = 0.9;

// The logo is a rounded red tile on a transparent margin, and the raccoon is a transparent
// cut-out (it only looks white on a white page). Trim to the tile, square it, then fill the
// cut-out white while the outside of the tile stays transparent (or becomes the brand red).
const trimmed = await sharp(SOURCE).trim({ threshold: 10 }).png().toBuffer();
const meta = await sharp(trimmed).metadata();
const side = Math.max(meta.width ?? 0, meta.height ?? 0);
const { data, info } = await sharp(trimmed)
  .resize(side, side, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Transparent pixels reachable from the border are outside the tile; the rest are the cut-out.
const { width, height } = info;
const outside = new Uint8Array(width * height);
const queue = [];
const clear = (i) => data[i * 4 + 3] < 128;
for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
while (queue.length > 0) {
  const i = queue.pop();
  if (outside[i] || !clear(i)) continue;
  outside[i] = 1;
  const x = i % width;
  if (x > 0) queue.push(i - 1);
  if (x < width - 1) queue.push(i + 1);
  if (i >= width) queue.push(i - width);
  if (i < width * (height - 1)) queue.push(i + width);
}

// The tile's anti-aliased rim counts as outside too, so it blends into the background, not white.
const RIM = 2;
for (let pass = 0; pass < RIM; pass++) {
  const grown = outside.slice();
  for (let i = 0; i < width * height; i++) {
    if (outside[i]) continue;
    const x = i % width;
    if (
      (x > 0 && outside[i - 1]) ||
      (x < width - 1 && outside[i + 1]) ||
      (i >= width && outside[i - width]) ||
      (i < width * (height - 1) && outside[i + width])
    ) {
      grown[i] = 1;
    }
  }
  outside.set(grown);
}

/** The tile with its cut-out filled white; outside pixels get `background` (or stay clear). */
function render(background) {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (outside[i] && !background) {
      data.copy(out, o, o, o + 4);
      continue;
    }
    // Composite the logo pixel over white (the cut-out) or the background (outside the tile).
    const { r, g, b } = outside[i] && background ? background : { r: 255, g: 255, b: 255 };
    const a = data[o + 3] / 255;
    out[o] = Math.round(data[o] * a + r * (1 - a));
    out[o + 1] = Math.round(data[o + 1] * a + g * (1 - a));
    out[o + 2] = Math.round(data[o + 2] * a + b * (1 - a));
    out[o + 3] = 255;
  }
  return sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

const tile = await render(null);

// The raccoon on its own: white, with the cut-out's coverage as alpha, trimmed to the art.
const artPixels = Buffer.alloc(data.length);
for (let i = 0; i < width * height; i++) {
  const o = i * 4;
  artPixels.fill(255, o, o + 3);
  artPixels[o + 3] = outside[i] ? 0 : 255 - data[o + 3];
}
const art = await sharp(artPixels, { raw: { width, height, channels: 4 } })
  .trim({ threshold: 10 })
  .png()
  .toBuffer();
const artMeta = await sharp(art).metadata();
const artDiagonal = Math.hypot(artMeta.width ?? 1, artMeta.height ?? 1);

async function plain(size, name) {
  await sharp(tile).resize(size, size, { kernel: "lanczos3" }).png().toFile(`${OUT}/${name}`);
}

/** Solid brand red, edge to edge, with the raccoon centred inside a circle of `safe` × size. */
async function fullBleed(size, name, safe) {
  const scale = (size * safe) / artDiagonal;
  const scaled = await sharp(art)
    .resize(Math.round((artMeta.width ?? 1) * scale), Math.round((artMeta.height ?? 1) * scale), {
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BRAND_RED } })
    .composite([{ input: scaled, gravity: "centre" }])
    .png()
    .toFile(`${OUT}/${name}`);
}

await plain(192, "icon-192.png");
await plain(512, "icon-512.png");
await plain(32, "favicon-32.png");
await fullBleed(512, "icon-maskable-512.png", MASKABLE_SAFE_DIAMETER);
await fullBleed(180, "apple-touch-icon.png", APPLE_SAFE_DIAMETER);
console.log(`Icons written to ${OUT}/ from ${SOURCE} (${side}×${side} tile).`);
