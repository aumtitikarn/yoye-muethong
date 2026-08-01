/**
 * Booked units ("entries") are numbered 1..N across the whole booking, while the
 * DB stores them as BookingItem rows carrying a quantity. Expanding those rows
 * — always in `id` order — gives the single mapping from entry number to the
 * item it belongs to.
 *
 * Both the detail API (which labels each slot for the customer) and the
 * cancel-entries API (which decrements the right item) go through here, so they
 * can never disagree about which slot is which.
 */
export interface EntrySlot<T> {
  /** 1-based entry number as shown to the customer. */
  entryIndex: number;
  item: T;
}

export function expandEntrySlots<T extends { quantity: number }>(
  itemsInIdOrder: T[],
): EntrySlot<T>[] {
  const slots: EntrySlot<T>[] = [];
  for (const item of itemsInIdOrder) {
    for (let i = 0; i < item.quantity; i++) {
      slots.push({ entryIndex: slots.length + 1, item });
    }
  }
  return slots;
}
