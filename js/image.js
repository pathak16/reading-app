// Shrinks a photo in the browser before upload, so each image is roughly 100-250 KB
// and the free 1 GB of Supabase storage lasts.
export async function compressImage(file, maxSize = 1280, quality = 0.78) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await loadWithImgTag(file);
  }
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image.'))), 'image/jpeg', quality)
  );
}

function loadWithImgTag(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Could not read that image. Try a JPEG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}
