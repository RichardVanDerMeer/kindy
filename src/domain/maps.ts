/** Opens an address in Google Maps; on Android the Maps app handles this link. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
}
