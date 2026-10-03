// Turning a mark into files and clipboard data.

export const INKS = {
  black: '#000000',
  white: '#FFFFFF',
};

export function toSvg(mark, color = INKS.black) {
  const { width: w, height: h, d } = mark;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none"><path fill="${color}" fill-rule="evenodd" clip-rule="evenodd" d="${d}"/></svg>`;
}

// Transparent PNG of just the mark, longest side `size` px.
export function toPng(mark, color = INKS.black, size = 1024) {
  const scale = size / Math.max(mark.width, mark.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mark.width * scale);
  canvas.height = Math.round(mark.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(mark.d), 'evenodd');
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

export async function copySvg(mark, color) {
  await navigator.clipboard.writeText(toSvg(mark, color));
}

export async function copyPng(mark, color) {
  const png = toPng(mark, color);
  try {
    // passing the promise keeps Safari's user-gesture requirement happy
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png })]);
  }
}

export function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveSvg(mark, color, name) {
  save(new Blob([toSvg(mark, color)], { type: 'image/svg+xml' }), `${name}.svg`);
}

export async function savePng(mark, color, name) {
  save(await toPng(mark, color), `${name}.png`);
}

// Small rounded-square favicon of the current mark.
export function faviconHref(mark) {
  const pad = 14;
  const box = 100 + pad * 2;
  const s = 100 / Math.max(mark.width, mark.height);
  const x = pad + (100 - mark.width * s) / 2;
  const y = pad + (100 - mark.height * s) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"><rect width="${box}" height="${box}" rx="${box * 0.23}" fill="#111"/><path transform="translate(${x} ${y}) scale(${s})" fill="#fff" fill-rule="evenodd" d="${mark.d}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
