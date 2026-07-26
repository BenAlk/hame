import type { BarcodeResolution, CreatePantryEntryInput, LinkBarcodeInput } from '@hame/shared'

/**
 * One scanned product awaiting review (spec §10 Phase 14). Scanning is only
 * allowed to automate *identification* — a barcode carries no expiry date, and
 * expiry is most of why a pantry entry exists, so every row is still reviewed
 * before it is committed.
 */
export interface ScannedRow {
  /** Unique per row, not per code: scanning the same product twice is two jars. */
  key: string
  code: string
  /** The looked-up product name, kept so a multi-barcode item stays legible. */
  label: string | null
  /** Set once matched to an existing item; null means "create from itemName". */
  itemId: string | null
  itemName: string
  /** True when the server already had this code against this exact item. */
  linked: boolean
  quantity: number
  unit: string | null
  /** `yyyy-mm-dd`, or empty for no use-by date. */
  expiry: string
}

/**
 * Turn a resolution into a review row. A known code arrives fully populated —
 * including the item's default quantity and unit — which is what makes the
 * second and later shops fast.
 */
export function rowFromResolution(resolution: BarcodeResolution, key: string): ScannedRow {
  const { code, item, suggestion } = resolution
  if (item) {
    return {
      key,
      code,
      label: null,
      itemId: item.id,
      itemName: item.name,
      linked: true,
      quantity: item.defaultQuantity ?? 1,
      unit: item.defaultUnit,
      expiry: '',
    }
  }
  return {
    key,
    code,
    label: suggestion?.name ?? null,
    itemId: null,
    // A suggestion pre-fills the name to confirm or correct; a miss leaves it
    // blank for typing. Either way the code is learned on commit.
    itemName: suggestion?.name ?? '',
    linked: false,
    quantity: 1,
    unit: null,
    expiry: '',
  }
}

/** True once a row has enough to be stocked — an item, by id or by name. */
export function isRowComplete(row: ScannedRow): boolean {
  return (row.itemId !== null || row.itemName.trim().length > 0) && row.quantity > 0
}

/**
 * The pantry rows to create. Exactly one of `itemId`/`itemName` is sent, which
 * is what the shared schema's refinement requires.
 */
export function toPantryEntries(rows: ScannedRow[], locationId: string): CreatePantryEntryInput[] {
  return rows.filter(isRowComplete).map((row) => ({
    ...(row.itemId ? { itemId: row.itemId } : { itemName: row.itemName.trim() }),
    locationId,
    quantity: row.quantity,
    unit: row.unit?.trim() || null,
    expiryDate: row.expiry ? new Date(row.expiry) : null,
  }))
}

/**
 * The codes worth teaching the household: anything not already linked to the
 * item it ended up against. Deduplicated by code, since a deliberate double
 * scan produces two rows but only one link — and the last edit wins, so
 * correcting a row after scanning it twice doesn't re-file it wrongly.
 */
export function toBarcodeLinks(rows: ScannedRow[]): LinkBarcodeInput[] {
  const byCode = new Map<string, LinkBarcodeInput>()
  for (const row of rows) {
    if (row.linked || !isRowComplete(row)) continue
    byCode.set(row.code, {
      code: row.code,
      ...(row.itemId ? { itemId: row.itemId } : { itemName: row.itemName.trim() }),
      label: row.label,
    })
  }
  return [...byCode.values()]
}
