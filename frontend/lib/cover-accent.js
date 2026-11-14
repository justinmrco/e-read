// A bounded hue histogram favors coloured artwork over black/white cover lettering.
export function coverHue(pixels) {
  const bins = Array.from({ length:24 }, () => ({ weight:0, hue:0 }));
  let coloured = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [r,g,b] = [pixels[i],pixels[i + 1],pixels[i + 2]].map(value => value / 255);
    const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min;
    const light = (max + min) / 2;
    if (light < .12 || light > .85 || delta < .1) continue;
    const saturation = delta / (1 - Math.abs(2 * light - 1));
    if (saturation < .2) continue;
    const hue = ((max === r ? (g-b)/delta : max === g ? (b-r)/delta + 2 : (r-g)/delta + 4) * 60 + 360) % 360;
    const bin = bins[Math.min(23, Math.floor(hue / 15))];
    bin.weight += saturation;
    bin.hue += hue * saturation;
    coloured++;
  }
  if (coloured < pixels.length / 4 * .05) return null;
  const best = bins.reduce((a,b) => b.weight > a.weight ? b : a);
  return best.weight ? Math.round(best.hue / best.weight) % 360 : null;
}
export function imageHue(image) {
  try {
    // Remote images keep their normal loading behavior; never request extra CORS access.
    const url = new URL(image.currentSrc || image.src, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === '/sample-cover.svg') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 24; canvas.height = 36;
    const context = canvas.getContext('2d', { willReadFrequently:true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 24, 36);
    return coverHue(context.getImageData(0, 0, 24, 36).data);
  } catch { return null; }
}
