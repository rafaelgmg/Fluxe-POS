/**
 * parseBarcode — extrai barcode limpo e minPrice de um raw barcode.
 *
 * Formato válido com minPrice embutido: "3616304679452.85"
 * Formato sem minPrice:                "3616304679452"
 *
 * @param {string} raw  — barcode bruto (ex: "3616304679452.85")
 * @returns {{ cleanBarcode: string, minPrice: number|null }}
 */
export function parseBarcode(raw) {
  if (!raw) return { cleanBarcode: '', minPrice: null }

  const str = String(raw).trim()
  const dotIndex = str.indexOf('.')

  if (dotIndex === -1) {
    return { cleanBarcode: str, minPrice: null }
  }

  const cleanBarcode = str.slice(0, dotIndex)
  const minPriceStr  = str.slice(dotIndex + 1)
  const minPrice     = minPriceStr !== '' ? parseFloat(minPriceStr) : null

  return {
    cleanBarcode,
    minPrice: isNaN(minPrice) ? null : minPrice,
  }
}

/**
 * buildBarcode — reconstrói o raw barcode com minPrice embutido.
 * Usado ao salvar/editar produtos no Admin.
 *
 * @param {string} cleanBarcode
 * @param {number|null} minPrice
 * @returns {string}
 */
export function buildBarcode(cleanBarcode, minPrice) {
  if (minPrice == null || minPrice === '') return String(cleanBarcode)
  return `${cleanBarcode}.${minPrice}`
}
