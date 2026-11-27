/** อายุเต็มปีจากวันเกิด (YYYY-MM-DD) */
export function age(birth: string) {
  const b = new Date(birth);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}
