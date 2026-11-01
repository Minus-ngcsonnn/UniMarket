import { isBlank } from './validators'

export const NOTE_MAX_LENGTH = 200

/** Vietnamese mobile number: 0 or +84, then a 3/5/7/8/9 network prefix and 8 digits (spaces/dots allowed). */
export function isVietnamesePhone(value) {
  return /^(0|\+84)(3|5|7|8|9)\d{8}$/.test(String(value).replace(/[\s.-]/g, ''))
}

/**
 * Delivery details at checkout (Business Plan: the buyer provides a delivery address, the seller arranges delivery).
 * @returns {object} { fieldName: message } for invalid fields
 */
export function validateDelivery({ fullName, phone, campus, address, note }) {
  const errors = {}
  if (isBlank(fullName)) errors.fullName = 'Enter the name of the person receiving the item.'
  else if (fullName.trim().length < 2) errors.fullName = 'Enter a full name.'

  if (isBlank(phone)) errors.phone = 'Phone number is required so the seller can reach you.'
  else if (!isVietnamesePhone(phone)) errors.phone = 'Enter a Vietnamese mobile number, e.g. 0912 345 678.'

  if (isBlank(campus)) errors.campus = 'Choose your campus.'

  if (isBlank(address)) errors.address = 'Tell the seller where to deliver, e.g. dormitory and room.'
  else if (address.trim().length < 5) errors.address = 'Add a bit more detail, e.g. “Dormitory A, room 305”.'

  if (note.length > NOTE_MAX_LENGTH) errors.note = `Keep the note under ${NOTE_MAX_LENGTH} characters.`
  return errors
}
