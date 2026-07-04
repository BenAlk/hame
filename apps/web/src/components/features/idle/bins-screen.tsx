import type { DueBins, ScheduledBin } from './idle-info'

/**
 * A colour-coded wheelie bin, filled with the bin's own colour. A translucent
 * dark outline keeps a pale bin (light grey glass/cans) legible on the cream
 * field, and a slightly darkened lid gives it form.
 */
function WheelieBin({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 100 150" className="h-full w-full" role="img" aria-label="Wheelie bin">
      {/* wheels */}
      <circle cx="30" cy="140" r="8" fill="rgba(0,0,0,0.55)" />
      <circle cx="70" cy="140" r="8" fill="rgba(0,0,0,0.55)" />
      {/* body (tapers slightly to the base) */}
      <path
        d="M22 42 L78 42 L72 134 L28 134 Z"
        fill={colour}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* moulded ridges for a bit of texture */}
      <path
        d="M40 52 L38 128 M60 52 L62 128 M50 52 L50 128"
        stroke="rgba(0,0,0,0.16)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* lid, a touch darker than the body */}
      <path
        d="M16 42 L84 42 L84 36 Q84 27 75 27 L25 27 Q16 27 16 36 Z"
        fill={colour}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M16 42 L84 42 L84 36 Q84 27 75 27 L25 27 Q16 27 16 36 Z" fill="rgba(0,0,0,0.12)" />
      {/* front lip handle */}
      <rect x="42" y="42" width="16" height="6" rx="2" fill="rgba(0,0,0,0.22)" />
    </svg>
  )
}

/**
 * Idle info screen for bins due today/tomorrow (spec §8.14). A stylised,
 * full-screen reminder — a big "Out today / tomorrow" headline over one wheelie
 * bin per due collection, each in its own colour.
 */
export function BinsScreen({ due }: { due: DueBins }) {
  const heading = due.when === 'today' ? 'Bins out today' : 'Bins out tomorrow'
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-10 bg-background px-8 text-ink">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-accent">Reminder</p>
        <h1 className="mt-2 font-serif text-6xl font-medium sm:text-7xl">{heading}</h1>
      </div>
      <div className="flex flex-wrap items-end justify-center gap-x-12 gap-y-8">
        {due.bins.map((bin: ScheduledBin) => (
          <div key={bin.id} className="flex flex-col items-center gap-4">
            <div className="h-[34vh] max-h-[320px] min-h-[180px]">
              <WheelieBin colour={bin.colour} />
            </div>
            <p className="max-w-[40vw] truncate font-serif text-2xl">{bin.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
