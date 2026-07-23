/**
 * BrandingContext — provides live branding values to React components and
 * triggers a re-render after org settings are loaded from Supabase.
 *
 * Non-React modules (supabaseRead, supabaseAuth, etc.) read the live bindings
 * from branding.js directly — no context needed for those.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import {
  BUSINESS, BUSINESS_SHORT, TAX_RATE, CURRENCY,
  RECEIPT_FOOTER, RECEIPT_LEGAL, SMS_SIGNATURE,
  LOCATIONS_CFG, RETAIL_LOCATIONS, DEFAULT_LOCATION,
  REGIONS, LOCATION_MAP, RETAIL_LOCATION_MAP,
} from '../config/branding'
import { fetchOrgSettings } from '../services/supabaseOrgSettings'

const BrandingContext = createContext(null)

function snapshot() {
  return {
    business:         BUSINESS,
    businessShort:    BUSINESS_SHORT,
    taxRate:          TAX_RATE,
    currency:         CURRENCY,
    receiptFooter:    RECEIPT_FOOTER,
    receiptLegal:     RECEIPT_LEGAL,
    smsSignature:     SMS_SIGNATURE,
    locations:        LOCATIONS_CFG,
    retailLocations:  RETAIL_LOCATIONS,
    defaultLocation:  DEFAULT_LOCATION,
    regions:          REGIONS,
    locationMap:      LOCATION_MAP,
    retailLocationMap: RETAIL_LOCATION_MAP,
  }
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(snapshot)
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    fetchOrgSettings()
      .then(() => setBranding(snapshot()))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  return (
    <BrandingContext.Provider value={{ ...branding, ready }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const ctx = useContext(BrandingContext)
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider')
  return ctx
}
