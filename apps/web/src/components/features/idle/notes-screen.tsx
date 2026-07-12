import type { Note } from '@hame/shared'

/**
 * Idle info screen for the household QuickNotes board (spec §8.16, §8.14). A
 * stylised full-screen "fridge board" of the household's current notes, each
 * tinted by its author's colour. Only household notes reach here (direct notes
 * never surface on the shared tablet), and only the first few are shown so the
 * wall stays glanceable from across the room.
 */
export function NotesScreen({ notes }: { notes: Note[] }) {
  const shown = notes.slice(0, 4)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-10 bg-background px-8 text-ink">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-accent">On the board</p>
        <h1 className="mt-2 font-serif text-5xl font-medium sm:text-6xl">QuickNotes</h1>
      </div>
      <div className="flex w-full max-w-5xl flex-wrap items-stretch justify-center gap-6">
        {shown.map((note) => {
          const tint = note.colour ?? note.author.colour
          return (
            <div
              key={note.id}
              className="flex min-w-[240px] max-w-sm flex-1 flex-col gap-3 rounded-card border-l-4 p-6 shadow-ambient"
              style={{ borderLeftColor: tint, backgroundColor: `${tint}1f` }}
            >
              <p className="whitespace-pre-wrap break-words font-serif text-2xl leading-snug">
                {note.body}
              </p>
              <p className="mt-auto text-sm uppercase tracking-wide text-muted-foreground">
                {note.author.firstName}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
