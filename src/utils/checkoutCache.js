// Browser storage is a fallible local copy, not confirmation of a cloud write.
export const CHECKOUT_CACHE_ERROR = 'fluxe-checkout-cache-error'

export function writeCheckoutCache(storage, key, sales, onError = () => {}) {
  try {
    storage.setItem(key, JSON.stringify(sales))
    return true
  } catch (error) {
    // Keep the previous copy intact. Never clear storage or discard unsynced sales.
    // Notify outside React's state updater so reporting cannot interrupt rendering.
    queueMicrotask(() => onError(error))
    return false
  }
}
