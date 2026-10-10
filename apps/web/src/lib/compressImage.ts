/** Longest edge sent to the API. Enough for small receipt print, about 0.3 MB as JPEG. */
const MAX_EDGE = 1600;
const QUALITY = 0.8;

/**
 * Downscales a photo and re-encodes it as JPEG before upload. Phones produce
 * 4-12 MB images; sending them as-is is slow on mobile data and costs more
 * tokens without improving the reading.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Formats the browser cannot decode (e.g. HEIC on some devices) go as-is.
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', QUALITY);
  });
}
