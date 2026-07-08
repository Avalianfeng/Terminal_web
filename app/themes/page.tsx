import Link from "next/link";

const themes = [
  {
    name: "Dual Phase Archive",
    status: "production v0.1",
    shell: "Black terminal shell",
    surface: "Light archive paper",
    description:
      "The stable direction for cylf.me v0.1. Commands stay in a dark precise shell, opened records appear as quiet paper cards.",
    swatch: "from-[#08090a] via-[#101318] to-[#f4f1ea]",
  },
  {
    name: "Deep Console",
    status: "candidate",
    shell: "Near black command space",
    surface: "Dim slate records",
    description:
      "More technical and private. Useful if the archive should feel like a personal operating system first.",
    swatch: "from-[#050506] via-[#0b1014] to-[#26323b]",
  },
  {
    name: "White Archive",
    status: "candidate",
    shell: "White retrieval desk",
    surface: "Cold paper records",
    description:
      "More sacred and institutional. Useful if the archive should feel like a reading room before it feels like software.",
    swatch: "from-[#f7f7f3] via-[#e7e9ea] to-[#111418]",
  },
  {
    name: "Reversal Chamber",
    status: "candidate",
    shell: "Pale command layer",
    surface: "Black deep records",
    description:
      "A stronger experimental direction where the public shell is calm and opened records move into a darker inner layer.",
    swatch: "from-[#ecece8] via-[#aeb8bf] to-[#08090a]",
  },
];

export default function ThemeLabPage() {
  return (
    <main className="min-h-[100dvh] bg-[#090a0b] px-4 py-8 text-slate-100 md:px-8">
      <section className="mx-auto max-w-[1200px]">
        <Link
          href="/"
          className="mb-10 inline-flex rounded-full border border-white/12 px-4 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:text-white active:translate-y-px"
        >
          back to terminal
        </Link>

        <div className="max-w-[760px]">
          <p className="mb-4 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            visual experiment bench
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.05em] md:text-6xl">
            Theme lab for a terminal archive.
          </h1>
          <p className="mt-6 max-w-[62ch] text-base leading-7 text-slate-400">
            This route is a safe place to explore visual systems while the main
            archive keeps a stable v0.1 shell.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {themes.map((theme) => (
            <article
              key={theme.name}
              className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.035]"
            >
              <div className={`h-44 bg-gradient-to-br ${theme.swatch}`} />
              <div className="space-y-5 p-5 md:p-7">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                      {theme.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">{theme.status}</p>
                  </div>
                  <div className="rounded-full border border-white/12 px-3 py-1 text-xs text-slate-400">
                    theme
                  </div>
                </div>

                <p className="max-w-[58ch] text-sm leading-6 text-slate-400">
                  {theme.description}
                </p>

                <dl className="grid gap-3 border-t border-white/10 pt-5 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Shell</dt>
                    <dd className="mt-1 text-slate-200">{theme.shell}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Record surface</dt>
                    <dd className="mt-1 text-slate-200">{theme.surface}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
