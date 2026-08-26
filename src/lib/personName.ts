/**
 * Comparing two written names for "is this the same party?".
 *
 * "คุณเสาวลักษณ์ พันธ์เรืองวงศ์" and "เสาวลักษณ์ พันธ์เรืองวงศ์" are one person.
 * Honorifics and spacing are how a name was typed on two different days, not
 * who it belongs to, and treating them as distinct labelled a customer the
 * resident of her own room.
 */
export function normalizeName(s: string): string {
  return (s || '')
    .replace(/^(คุณ|คุุณ|นาย|นาง|นางสาว|น\.ส\.|K\.|k\.|Mr\.|Mrs\.|Ms\.)\s*/i, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function sameParty(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b)
}

/** Does this name read as a company rather than a person? Used to spot a
 *  customer record filed under the developer while the job it holds was bought
 *  and paid for by a resident — the trap that turned eighteen B2C records into
 *  B2B, because the screen showed "บริษัท" and the person choosing believed it. */
export function looksLikeCompany(s: string): boolean {
  return /บริษัท|จำกัด|หจก|ห้างหุ้นส่วน|Co\.|Ltd|Company/i.test(s || '')
}
