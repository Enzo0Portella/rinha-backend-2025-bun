import type { ProcessorType } from '@/types'

interface StoredItem {
  timestamp: number
  value: number
  processor: ProcessorType
}

export class MemoryStore {
  private readonly AMOUNT_MASK = 0x7ff
  private readonly TIMESTAMP_MASK = 0x1fffff
  private readonly PROCESSOR_MASK = 0x1

  private readonly createdAt: number
  private items: number[] = []
  private cachedResult: StoredItem[] | null = null
  private cacheVersion = 0

  constructor() {
    this.createdAt = Date.now()
  }

  private pack(amount: number, timestampMs: number, processor: ProcessorType): number {
    const cents = (amount * 100 + 0.5) | 0

    if (cents > this.AMOUNT_MASK) {
      throw new Error(
        `Amount muito alto: máximo R$ ${
          this.AMOUNT_MASK / 100
        } (atual: R$ ${amount})`
      )
    }

    const rel = timestampMs - this.createdAt

    if (rel < 0 || rel > this.TIMESTAMP_MASK) {
      throw new Error(
        `Timestamp fora do range: máximo ${this.TIMESTAMP_MASK}ms (~${(
          this.TIMESTAMP_MASK / 60000
        ).toFixed(1)} min)`
      )
    }

    const processorBit = processor === 'fallback' ? 1 : 0
    return (rel << 12) | (processorBit << 11) | cents
  }

  private unpack(packed: number): { amount: number; timestamp: number; processor: ProcessorType } {
    const cents = packed & this.AMOUNT_MASK
    const processorBit = (packed >>> 11) & this.PROCESSOR_MASK
    const rel = (packed >>> 12) & this.TIMESTAMP_MASK

    return {
      amount: cents * 0.01,
      timestamp: this.createdAt + rel,
      processor: processorBit === 1 ? 'fallback' : 'default'
    }
  }

  add(timestampMs: number, value: number, processor: ProcessorType = 'default') {
    const packed = this.pack(value, timestampMs, processor)
    this.items.push(packed)
    this.cachedResult = null
    this.cacheVersion++
  }

  getAll() {
    if (this.cachedResult !== null) {
      return this.cachedResult
    }

    const result: StoredItem[] = []

    for (const packed of this.items) {
      const unpacked = this.unpack(packed)

      result.push({
        timestamp: unpacked.timestamp,
        value: unpacked.amount,
        processor: unpacked.processor,
      })
    }

    this.cachedResult = result
    return result
  }

  async clear(): Promise<void> {
    this.items = []
    this.cachedResult = null
    this.cacheVersion++
  }
}
