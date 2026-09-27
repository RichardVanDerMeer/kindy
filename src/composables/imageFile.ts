/**
 * Reads a picked image and scales it down so it stays small enough to store
 * locally and to back up. Square crops suit avatars; banners keep their ratio.
 */
export async function readImageFile(
  file: File,
  options: { maxSize: number; square?: boolean },
): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const source = options.square
    ? {
        x: (bitmap.width - side) / 2,
        y: (bitmap.height - side) / 2,
        width: side,
        height: side,
      }
    : { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
  const scale = Math.min(1, options.maxSize / source.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  canvas
    .getContext('2d')
    ?.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}
