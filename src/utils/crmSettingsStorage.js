const KEY = 'fluxe-crm-settings-v1'

export const ALL_FIELDS = [
  { key: 'firstName', label: 'First Name'  },
  { key: 'lastName',  label: 'Last Name'   },
  { key: 'phone',     label: 'Mobile'      },
  { key: 'email',     label: 'Email'       },
  { key: 'birthday',  label: 'Birthday'    },
  { key: 'notes',     label: 'Notes'       },
  { key: 'fragrancePreferences', label: 'Fragrance Preferences' },
]

export const DEFAULT_SETTINGS = {
  mandatoryFields: ['firstName', 'phone'],
  loyaltyTiers: [
    { stars: 1, min: 0,    max: 100  },
    { stars: 2, min: 100,  max: 300  },
    { stars: 3, min: 300,  max: 700  },
    { stars: 4, min: 700,  max: 2000 },
    { stars: 5, min: 2000, max: null },
  ],
}

export function loadCRMSettings() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const saved = JSON.parse(raw)
    return {
      mandatoryFields: saved.mandatoryFields ?? DEFAULT_SETTINGS.mandatoryFields,
      loyaltyTiers:    saved.loyaltyTiers    ?? DEFAULT_SETTINGS.loyaltyTiers,
    }
  } catch (err) {
    console.warn('[Fluxe] CRM settings corrupted, reverting to defaults:', err.message)
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveCRMSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
