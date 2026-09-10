/**
 * Cleaning and comparing customer names.
 *
 * Names get typed, but they also get pasted — out of a PDF, out of a chat, out
 * of a booking sheet. What comes across carries characters nobody can see: a
 * non-breaking space instead of a space, a double space between first and last
 * name, a stray space at the end. The name looks identical on screen and is a
 * different string to every comparison in the app.
 *
 * That is not hypothetical. บริษัท ออริจิ้น เพลย์ ศรีอุดม ended up as two
 * customer records because the second one was pasted out of a PDF: the duplicate
 * check ran `.trim().toLowerCase()`, which does not touch a non-breaking space
 * or a doubled one, found no match, and opened a new record. The audit on
 * 2026-09-07 found 66 rows carrying one of these — 30 customers and 36 jobs
 * (25 double spaces, 5 edge spaces, 1 NBSP), cleaned and backed up to
 * backup_names_20260907.
 *
 * Two functions, and they do different jobs:
 *   - `cleanName` is what gets *stored*. It only removes what is invisible;
 *     every visible character survives, so the register keeps what sales typed.
 *   - `nameKey` is what gets *compared*. It goes further — case, and for a
 *     company the บริษัท / จำกัด / Co., Ltd. wrapper — because "บริษัท ก จำกัด"
 *     and "ก" are the same buyer and should not become two records.
 *
 * Never store `nameKey`. It throws away real characters on purpose.
 */

/** Spaces that are not U+0020, plus the zero-width characters that a paste can
 *  leave behind. Zero-width ones are deleted; the rest become a normal space. */
const WIDE_SPACE = /[   -   　\t\n\r]/g
const ZERO_WIDTH = /[​-‍⁠﻿]/g

/** The stored form of a name: what was typed, minus what cannot be seen. */
export function cleanName(raw: string | null | undefined): string {
  return (raw || '')
    .replace(ZERO_WIDTH, '')
    .replace(WIDE_SPACE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The comparison form: `cleanName`, lowercased, with the company wrapper off.
 *  Use it to ask "is this the same buyer?", never to display or to store. */
export function nameKey(raw: string | null | undefined): string {
  return cleanName(raw)
    .toLowerCase()
    .replace(/บริษัท|จำกัด|\(มหาชน\)|มหาชน|ห้างหุ้นส่วน(จำกัด)?|หจก\.?|co\.?,?\s*ltd\.?|company|limited|public/gi, '')
    .replace(/[\s.,()-]/g, '')
}
