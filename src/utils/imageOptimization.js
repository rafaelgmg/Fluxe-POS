/**
 * optimizeAvatarImage — center-crop → resize to square → compress to WebP.
 * Runs entirely in the browser via Canvas API before the image is stored.
 *
 * @param {File} file   Original image file (jpeg / png / webp)
 * @param {object} [opts]
 * @param {number} [opts.size=512]               Output px (width = height)
 * @param {number} [opts.quality=0.85]           WebP quality 0–1
 * @param {string} [opts.outputType='image/webp'] MIME type
 * @returns {Promise<File>}  Optimized File named "<original>-avatar.webp"
 * @throws {Error}           If file is not an image or Canvas export fails
 */
export function optimizeAvatarImage(file, {
  size       = 512,
  quality    = 0.85,
  outputType = 'image/webp',
} = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selected file is not a valid image.'))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        // Center-crop to 1:1 square using the shorter side
        const side = Math.min(img.width, img.height)
        const sx   = (img.width  - side) / 2
        const sy   = (img.height - side) / 2

        const canvas = document.createElement('canvas')
        canvas.width  = size
        canvas.height = size

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas export failed — try a different image.')); return }
            const baseName = file.name.replace(/\.[^.]+$/, '')
            resolve(new File([blob], `${baseName}-avatar.webp`, { type: outputType }))
          },
          outputType,
          quality,
        )
      } catch (err) {
        reject(err)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image. File may be corrupted or unsupported.'))
    }

    img.src = url
  })
}
