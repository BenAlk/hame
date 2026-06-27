/**
 * A small, dependency-free QR Code encoder (ISO/IEC 18004) — enough to render a
 * WiFi join code on the dashboard (spec §8.12, §10 Phase 7.2). We keep the whole
 * encoder in-tree rather than pull a library, in keeping with the project's
 * dependency-light leaning (the bin scraper, the custom calendar grid).
 *
 * Scope is deliberately narrow: byte mode (UTF-8), error-correction level M,
 * versions 1–10. Version 10-M holds ~210 bytes, far more than any WiFi payload,
 * and byte mode encodes the full ASCII/UTF-8 of an SSID and password. The output
 * is a square matrix of booleans (true = dark module), with no quiet zone — the
 * caller adds the margin when drawing.
 */

/** Error-correction codewords per block, level M, indexed by version (1–10). */
const ECC_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
/** Number of error-correction blocks, level M, indexed by version (1–10). */
const NUM_ERROR_CORRECTION_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const MIN_VERSION = 1
const MAX_VERSION = 10
/** GF(256) primitive polynomial for QR (x^8 + x^4 + x^3 + x^2 + 1). */
const REED_SOLOMON_PRIMITIVE = 0x11d

/** Extract bit `i` (0 = least significant) of `x`. */
function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0
}

/** Append the low `len` bits of `val` (most significant first) to `bits`. */
function appendBits(val: number, len: number, bits: number[]): void {
  for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
}

/** Total data-and-EC modules (i.e. bits) available in a version, before /8. */
function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (version >= 7) result -= 36
  }
  return result
}

/** Usable data codewords (bytes) for a version at level M (raw minus EC). */
function getDataCodewordCount(version: number): number {
  const raw = Math.floor(getNumRawDataModules(version) / 8)
  return raw - ECC_CODEWORDS_PER_BLOCK[version] * NUM_ERROR_CORRECTION_BLOCKS[version]
}

/** Byte-mode character-count indicator width for a version. */
function charCountBits(version: number): number {
  return version < 10 ? 8 : 16
}

// ── Reed–Solomon over GF(256) ────────────────────────────────────────────────

export function reedSolomonMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * REED_SOLOMON_PRIMITIVE)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

/** Generator polynomial coefficients for `degree` EC codewords. */
function reedSolomonComputeDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1 // start as the monomial x^0
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}

/** EC codewords for `data` given a precomputed `divisor`. */
export function reedSolomonComputeRemainder(data: readonly number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor)
    })
  }
  return result
}

/** Split data codewords into blocks, append EC per block, and interleave. */
function addEccAndInterleave(data: number[], version: number): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version]
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[version]
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)

  const blocks: number[][] = []
  const rsDiv = reedSolomonComputeDivisor(blockEccLen)
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)
    const dat = data.slice(k, k + datLen)
    k += dat.length
    const ecc = reedSolomonComputeRemainder(dat, rsDiv)
    if (i < numShortBlocks) dat.push(0) // pad short blocks so columns line up
    blocks.push(dat.concat(ecc))
  }

  const result: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      // The padding column of short blocks is skipped during interleaving.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i])
    })
  }
  return result
}

// ── Matrix construction ──────────────────────────────────────────────────────

interface Grid {
  size: number
  modules: boolean[][]
  isFunction: boolean[][]
}

function newGrid(version: number): Grid {
  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  return { size, modules, isFunction }
}

function setFunction(grid: Grid, row: number, col: number, isDark: boolean): void {
  grid.modules[row][col] = isDark
  grid.isFunction[row][col] = true
}

function drawFinder(grid: Grid, row: number, col: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy))
      const yy = row + dy
      const xx = col + dx
      if (yy >= 0 && yy < grid.size && xx >= 0 && xx < grid.size) {
        setFunction(grid, yy, xx, dist !== 2 && dist !== 4)
      }
    }
  }
}

function drawAlignment(grid: Grid, row: number, col: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(grid, row + dy, col + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
}

/** Alignment-pattern centre coordinates for a version (empty for version 1),
 *  ascending — the finder-corner skip in {@link drawFunctionPatterns} relies on
 *  6 being first and the largest being last. */
function alignmentPositions(version: number): number[] {
  if (version === 1) return []
  const size = version * 4 + 17
  const numAlign = Math.floor(version / 7) + 2
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2
  const positions = [6]
  for (let pos = size - 7; positions.length < numAlign; pos -= step) positions.splice(1, 0, pos)
  return positions
}

/** Lay down all the fixed function patterns plus placeholder format/version bits. */
function drawFunctionPatterns(grid: Grid, version: number): void {
  const { size } = grid
  for (let i = 0; i < size; i++) {
    setFunction(grid, 6, i, i % 2 === 0)
    setFunction(grid, i, 6, i % 2 === 0)
  }
  drawFinder(grid, 3, 3)
  drawFinder(grid, 3, size - 4)
  drawFinder(grid, size - 4, 3)

  const align = alignmentPositions(version)
  const n = align.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)
      if (!onFinder) drawAlignment(grid, align[i], align[j])
    }
  }

  drawFormatBits(grid, 0) // placeholder; rewritten once the mask is chosen
  drawVersion(grid, version)
}

/** Write the 15-bit format information for a given mask (level M). */
function drawFormatBits(grid: Grid, mask: number): void {
  const { size } = grid
  const formatEcc = 0 // level M's 2-bit indicator
  const bits = (formatEcc << 3) | mask
  let rem = bits
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const data = (((bits << 10) | rem) ^ 0x5412) & 0x7fff

  // First copy: bits 0–5 down column 8 (rows 0–5), 6–8 around the corner, 9–14
  // along row 8 (skipping the timing row/column at index 6).
  for (let i = 0; i <= 5; i++) setFunction(grid, i, 8, getBit(data, i))
  setFunction(grid, 7, 8, getBit(data, 6))
  setFunction(grid, 8, 8, getBit(data, 7))
  setFunction(grid, 8, 7, getBit(data, 8))
  for (let i = 9; i < 15; i++) setFunction(grid, 8, 14 - i, getBit(data, i))

  // Second copy: bits 0–7 along row 8 from the right, 8–14 up column 8 from the
  // bottom, beside the top-right and bottom-left finders.
  for (let i = 0; i < 8; i++) setFunction(grid, 8, size - 1 - i, getBit(data, i))
  for (let i = 8; i < 15; i++) setFunction(grid, size - 15 + i, 8, getBit(data, i))
  setFunction(grid, size - 8, 8, true) // the always-dark module, at (4·version+9, 8)
}

/** Write the 18-bit version information (only present for version ≥ 7). */
function drawVersion(grid: Grid, version: number): void {
  if (version < 7) return
  const { size } = grid
  let rem = version
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  const bits = (version << 12) | rem
  for (let i = 0; i < 18; i++) {
    const bit = getBit(bits, i)
    const a = size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    setFunction(grid, a, b, bit)
    setFunction(grid, b, a, bit)
  }
}

/** Place the codeword bitstream into the grid in the standard zigzag order. */
function drawCodewords(grid: Grid, codewords: number[]): void {
  const { size } = grid
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // skip the vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j
        const upward = ((right + 1) & 2) === 0
        const row = upward ? size - 1 - vert : vert
        if (!grid.isFunction[row][col] && i < codewords.length * 8) {
          grid.modules[row][col] = getBit(codewords[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }
}

function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return col % 3 === 0
    case 3:
      return (row + col) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  }
}

/** XOR the mask into every non-function module (applying twice undoes it). */
function applyMask(grid: Grid, mask: number): void {
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (!grid.isFunction[row][col] && maskCondition(mask, row, col)) {
        grid.modules[row][col] = !grid.modules[row][col]
      }
    }
  }
}

/** The four penalty rules (ISO/IEC 18004 §8.8.2) used to pick the best mask. */
function penaltyScore(grid: Grid): number {
  const { size, modules } = grid
  let score = 0
  const N1 = 3
  const N2 = 3
  const N3 = 40
  const N4 = 10

  // Rule 1 — runs of five or more same-coloured modules in a row/column.
  for (let row = 0; row < size; row++) {
    for (let dir = 0; dir < 2; dir++) {
      let run = 1
      let prev = dir === 0 ? modules[row][0] : modules[0][row]
      for (let i = 1; i < size; i++) {
        const cur = dir === 0 ? modules[row][i] : modules[i][row]
        if (cur === prev) {
          run++
          if (run === 5) score += N1
          else if (run > 5) score++
        } else {
          run = 1
          prev = cur
        }
      }
    }
  }

  // Rule 2 — 2×2 blocks of one colour.
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const c = modules[row][col]
      if (
        c === modules[row][col + 1] &&
        c === modules[row + 1][col] &&
        c === modules[row + 1][col + 1]
      ) {
        score += N2
      }
    }
  }

  // Rule 3 — finder-like 1:1:3:1:1 patterns with four light modules beside them.
  const pattern = [true, false, true, true, true, false, true]
  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size - 7; col++) {
      for (let dir = 0; dir < 2; dir++) {
        let matches = true
        for (let k = 0; k < 7; k++) {
          const cell = dir === 0 ? modules[row][col + k] : modules[col + k][row]
          if (cell !== pattern[k]) {
            matches = false
            break
          }
        }
        if (!matches) continue
        const before = (idx: number): boolean => {
          for (let k = 1; k <= 4; k++) {
            const p = idx - k
            if (p < 0) return false
            const cell = dir === 0 ? modules[row][p] : modules[p][row]
            if (cell) return false
          }
          return true
        }
        const after = (idx: number): boolean => {
          for (let k = 1; k <= 4; k++) {
            const p = idx + k
            if (p >= size) return false
            const cell = dir === 0 ? modules[row][p] : modules[p][row]
            if (cell) return false
          }
          return true
        }
        if (before(col) || after(col + 6)) score += N3
      }
    }
  }

  // Rule 4 — overall deviation from a 50% dark/light balance.
  let dark = 0
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (modules[row][col]) dark++
  }
  const total = size * size
  const k = Math.floor(Math.abs(dark * 20 - total * 10) / total) // count of 5% steps from 50%
  score += k * N4

  return score
}

/** Smallest version (1–10, level M) that fits a byte payload of `length` bytes. */
function chooseVersion(length: number): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    const capacityBits = getDataCodewordCount(version) * 8
    const usedBits = 4 + charCountBits(version) + length * 8
    if (usedBits <= capacityBits) return version
  }
  throw new Error('QR payload too large')
}

/**
 * Encode `text` (UTF-8, byte mode, level M) and return the module matrix
 * (`true` = dark). Picks the smallest fitting version and the lowest-penalty
 * mask, exactly as the standard prescribes.
 */
export function encodeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  const version = chooseVersion(bytes.length)
  const dataCapacityBits = getDataCodewordCount(version) * 8

  const bits: number[] = []
  appendBits(0b0100, 4, bits) // byte-mode indicator
  appendBits(bytes.length, charCountBits(version), bits)
  for (const b of bytes) appendBits(b, 8, bits)

  appendBits(0, Math.min(4, dataCapacityBits - bits.length), bits) // terminator
  appendBits(0, (8 - (bits.length % 8)) % 8, bits) // pad to a byte boundary
  for (let pad = 0xec; bits.length < dataCapacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bits)

  const dataCodewords = new Array<number>(bits.length >>> 3).fill(0)
  bits.forEach((bit, i) => {
    dataCodewords[i >>> 3] |= bit << (7 - (i & 7))
  })

  const allCodewords = addEccAndInterleave(dataCodewords, version)

  const grid = newGrid(version)
  drawFunctionPatterns(grid, version)
  drawCodewords(grid, allCodewords)

  // Try every mask, keep the one with the lowest penalty, then commit it.
  let bestMask = 0
  let minPenalty = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(grid, mask)
    drawFormatBits(grid, mask)
    const penalty = penaltyScore(grid)
    if (penalty < minPenalty) {
      minPenalty = penalty
      bestMask = mask
    }
    applyMask(grid, mask) // undo before the next trial
  }
  applyMask(grid, bestMask)
  drawFormatBits(grid, bestMask)

  return grid.modules
}
