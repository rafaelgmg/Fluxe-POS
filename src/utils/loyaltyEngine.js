import { loadCRMSettings } from './crmSettingsStorage'

/** Returns 1–5 stars based on totalSpent vs configured tiers. 0 = no tier matched. */
export function getLoyaltyStars(totalSpent) {
  const { loyaltyTiers } = loadCRMSettings()
  for (const tier of loyaltyTiers) {
    if (totalSpent >= tier.min && (tier.max === null || totalSpent < tier.max)) {
      return tier.stars
    }
  }
  return 0
}

/** Renders filled/empty stars as a string. */
export function starsLabel(stars) {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars)
}

/**
 * Calculates a simple CRM score 0–100 based on available data.
 * Used for AI-readiness field — not shown publicly.
 */
export function calcCRMScore(customer) {
  const p = customer.purchases || []
  const totalSpent   = p.reduce((s, x) => s + (x.total || 0), 0)
  const numPurchases = p.length
  let score = 0
  score += Math.min(40, Math.round(totalSpent / 50))    // up to 40pts from spend
  score += Math.min(20, numPurchases * 5)                // up to 20pts from frequency
  score += customer.phone ? 10 : 0                       // 10pts for phone
  score += customer.email ? 10 : 0                       // 10pts for email
  score += Math.min(12, (customer.fragrancePreferences || []).length * 3) // up to 12pts
  score += customer.notes ? 8 : 0                        // 8pts for notes
  return Math.min(100, score)
}
