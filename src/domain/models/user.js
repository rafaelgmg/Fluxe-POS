/**
 * Persisted user record.
 *
 * @typedef {Object} User
 * @property {number}              id
 * @property {string}              firstName
 * @property {string}              lastName
 * @property {string}              position    'Manager' | 'Sales' | ...
 * @property {string}              email
 * @property {string}              phone
 * @property {string}              pin         4–6 digit numeric string
 * @property {'active'|'inactive'} status
 * @property {number}              hourlyRate
 * @property {null}                photo       placeholder (not yet implemented)
 * @property {string}              createdAt   ISO string
 */

/**
 * Derived runtime shape — computed from User, never persisted.
 *
 * @typedef {Object} Employee
 * @property {number} id
 * @property {string} name    firstName + ' ' + lastName (trimmed)
 * @property {string} pin
 * @property {string} role    position.toLowerCase()
 * @property {null}   photo
 */

export const USER_DEFAULTS = {
  lastName:   '',
  position:   'Sales',
  email:      '',
  phone:      '',
  status:     'active',
  hourlyRate: 0,
  photo:      null,
}
