import { localDate } from "@/lib/format";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Período do relatório (padrão: últimos 30 dias), limitado a 366 dias e com início ≤ fim. */
export function parsePeriod(de: unknown, ate: unknown, timeZone: string): { from: string; to: string } {
  const today = localDate(new Date(), timeZone);
  const back = new Date(`${today}T12:00:00Z`);
  back.setUTCDate(back.getUTCDate() - 29);
  let from = isDate(de) ? de : back.toISOString().slice(0, 10);
  let to = isDate(ate) ? ate : today;
  if (from > to) [from, to] = [to, from];
  const maxFrom = new Date(`${to}T12:00:00Z`);
  maxFrom.setUTCDate(maxFrom.getUTCDate() - 365);
  if (from < maxFrom.toISOString().slice(0, 10)) from = maxFrom.toISOString().slice(0, 10);
  return { from, to };
}
