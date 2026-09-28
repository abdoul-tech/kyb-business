const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Date ISO `AAAA-MM-JJ` qui existe au calendrier (refuse 2023-02-30).
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Affichage et export Bridge en `JJ/MM/AAAA`. Aucune correction : un « 01/01 » reste un « 01/01 ».
export function formatDisplayDate(isoDate: string): string {
  if (!isIsoDate(isoDate)) {
    throw new Error(`Date ISO invalide : ${isoDate}`);
  }
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
