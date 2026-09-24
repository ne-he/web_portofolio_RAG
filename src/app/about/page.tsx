"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/components/layout/ThemeProvider";

const MISSION = [
  {
    title: "Kuasai AI/ML sampai level penyedia, bukan sekadar pengguna",
    body: "Mendalami machine learning & AI engineering, dari modeling sampai deployment, biar jadi orang yang membangun solusi, bukan cuma memakainya.",
  },
  {
    title: "Bangun karya nyata, bukan numpuk gelar",
    body: "Menumpuk bukti lewat proyek yang benar-benar jalan & ter-deploy. Dampak lahir dari karya, bukan teori di atas kertas.",
  },
  {
    title: "Jembatani teknis dan manusia",
    body: "Memakai latar panggung & komunikasi untuk menerjemahkan hal kompleks jadi nilai yang dimengerti siapa pun.",
  },
  {
    title: "Berkontribusi untuk keluarga & Indonesia",
    body: "Menjadikan kemampuan teknis ini berguna, buat membanggakan orang tua dan ikut memajukan negeri.",
  },
];

const PRINCIPLES = [
  "“Proses tidak akan mengkhianati hasil.”",
  "AI itu mesin jenius yang harus dijadikan teman, sebelum jadi musuh.",
  "Idealis, dengan landasan yang realistis.",
];

export default function AboutPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const card = `glass-soft ${isDark ? "" : "is-light"} rounded-3xl p-6 md:p-8`;
  const muted = isDark ? "text-white/70" : "text-black/70";
  const faint = isDark ? "text-white/50" : "text-black/50";
  const label = `mb-3 text-xs font-semibold uppercase tracking-[0.18em] ${faint}`;
  const hi = isDark ? "text-white" : "text-black";

  return (
    <PageShell title="About">
      <section className={card}>
        <p className={label}>Vision</p>
        <p
          className={`text-xl leading-relaxed md:text-2xl ${hi}`}
          style={{ fontWeight: 400, letterSpacing: "-0.01em" }}
        >
          Menjadi AI/ML engineer yang bukan cuma cakap secara teknis, tapi juga mampu memimpin,
          mempresentasikan, dan membawa dampak nyata: buat keluarga, dan buat Indonesia.
        </p>
        <p className={`mt-4 text-sm ${faint}`}>
          Satu kata untuk era berikutnya: <span className={hi}>Unstoppable.</span>
        </p>
      </section>

      <section className={card}>
        <p className={label}>Mission</p>
        <div className="space-y-5">
          {MISSION.map((m, i) => (
            <div key={m.title} className="flex gap-4">
              <span className={`pt-0.5 text-sm font-semibold ${faint}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-medium">{m.title}</h3>
                <p className={`mt-1 text-sm leading-relaxed ${muted}`}>{m.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <p className={label}>Prinsip yang dipegang</p>
        <ul className={`space-y-2.5 text-[15px] leading-relaxed ${muted}`}>
          {PRINCIPLES.map((p) => (
            <li key={p} className="flex gap-2">
              <span className={faint}>•</span>
              {p}
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/"
        className={`${card} block text-center transition-transform hover:-translate-y-0.5`}
      >
        <p className="font-medium">Mau kenal lebih jauh?</p>
        <p className={`mt-1 text-sm ${muted}`}>Tanya apa aja ke AI Nemi →</p>
      </Link>
    </PageShell>
  );
}
