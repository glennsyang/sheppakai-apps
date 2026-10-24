/**
 * Downscale a phone photo to a JPEG no larger than `maxSide` px on its longest side. Keeps
 * uploads small (a 12 MP photo becomes ~300 KB) and converts formats the server won't take,
 * such as HEIC, wherever the browser can decode them. Returns the original file if decoding
 * fails, so the server can still accept or reject it.
 */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file;
	}

	const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', quality)
	);
	return blob ?? file;
}
