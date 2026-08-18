// Converts any phone format we might have stored (+61..., 61..., raw
// digits) into a clean Australian local display/input format:
//   +61414705803  ->  0414 705 803
// Falls back to returning the input unchanged if it doesn't look like a
// recognisable Australian number, rather than mangling something unexpected.
export function toAuLocal(phone) {
  if (!phone) return '';
  let digits = String(phone).trim().replace(/[\s\-()]/g, '');

  if (digits.startsWith('+61')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('61') && digits.length > 9) digits = `0${digits.slice(2)}`;

  if (/^0\d{9}$/.test(digits)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return digits;
}
