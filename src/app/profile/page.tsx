"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/components/layout/ThemeProvider";

const EXPERIENCE = [
  {
    role: "Part-time Marketer",
    org: "BINUS University Admission, Kemanggisan",
    time: "2 tahun",
    desc: "Akuisisi calon mahasiswa: campus tour, workshop sekolah, presentasi ke guru & orang tua. Rekor 45 pendaftar dalam sebulan — jauh di atas target standar 3.",
  },
  {
    role: "Idea Content Creator & Event Organizer",
    org: "HOPHOP Office",
    time: "Mar–Sep 2024",
    desc: "Event Genshin Impact × HopHop Indonesia 2024 — ide konten kreatif + eksekusi acara.",
  },
  {
    role: "Liaison Officer",
    org: "BNI National Conference 2024",
    time: "2024",
    desc: "Mendampingi direktur dari berbagai negara — komunikasi lintas budaya kelas eksekutif.",
  },
];

const SKILLS = [
  { group: "Core", items: ["Python", "SQL", "R", "JavaScript", "C / C++"] },
  {
    group: "ML & Deep Learning",
    items: ["scikit-learn", "PyTorch", "CNN · RNN", "Time Series", "NLP", "Computer Vision"],
  },
  {
    group: "MLOps & Cloud",
    items: ["AWS — SageMaker · EC2 · Lambda · EMR · ECR", "MLflow", "FastAPI", "Streamlit", "Docker"],
  },
  { group: "GenAI", items: ["RAG", "LLM API", "LangChain", "Prompt Engineering"] },
  { group: "Data & Web", items: ["Supabase · PostgreSQL", "Tableau · Power BI", "Next.js", "Three.js"] },
];

const ACHIEVEMENTS = [
  "Beasiswa Full 4 Tahun BINUS (berbasis merit)",
  "Tampil teater di Gedung Kesenian Jakarta",
  "Juara 3 YES TO ASEAN Monologue",
  "Juara 3 Lomba Band tingkat kota 2023",
  "Coaching: murid Juara 1 FLS3N Mendongeng → tingkat provinsi",
  "BINUS Ambassador 2024",
];

const CONTACTS = [
  { label: "Email", href: "mailto:nehewj@gmail.com" },
  { label: "WhatsApp", href: "https://wa.me/6281911497766" },
  { label: "GitHub", href: "https://github.com/ne-he" },
  { label: "Instagram", href: "https://instagram.com/nehemiah_wj" },
];

export default function ProfilePage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const card = `glass-soft ${isDark ? "" : "is-light"} rounded-3xl p-6 md:p-7`;
  const muted = isDark ? "text-white/70" : "text-black/70";
  const faint = isDark ? "text-white/50" : "text-black/50";
  const label = `mb-4 text-xs font-semibold uppercase tracking-[0.18em] ${faint}`;
  const pill = `rounded-full px-2.5 py-1 text-xs ${
    isDark ? "bg-white/10 text-white/80" : "bg-black/[0.06] text-black/70"
  }`;

  return (
    <PageShell title="Profile">
      <section className={card}>
        <h2 className="text-2xl font-semibold tracking-tight">Nehemiah Wilhelmus Junaidi</h2>
        <p className={`mt-1 ${muted}`}>
          “Nemi” · Data Science @ BINUS (Sem 4) · AI/ML — MLE ✕ AI Engineer
        </p>
        <p className={`mt-1 text-sm ${faint}`}>Jakarta · sedang internship · ♊ Gemini · INTP</p>
        <p className={`mt-4 text-[15px] leading-relaxed ${muted}`}>
          Mahasiswa Data Science BINUS yang fokus di AI/ML. Di balik kerja teknisnya, Nemi punya
          latar panggung kuat — teater, band, MC, 2 tahun marketing — yang bikin dia jago
          menerjemahkan hal teknis jadi nilai yang dimengerti orang.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {CONTACTS.map((c) => (
            <a
              key={c.label}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${pill} transition-opacity hover:opacity-100`}
            >
              {c.label}
            </a>
          ))}
        </div>
      </section>

      <section className={card}>
        <p className={label}>Pengalaman</p>
        <div className="space-y-4">
          {EXPERIENCE.map((e) => (
            <div key={e.role}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="font-medium">{e.role}</h3>
                <span className={`text-xs ${faint}`}>{e.time}</span>
              </div>
              <p className={`text-sm ${isDark ? "text-white/60" : "text-black/60"}`}>{e.org}</p>
              <p className={`mt-1 text-sm leading-relaxed ${muted}`}>{e.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <p className={label}>Skills</p>
        <div className="space-y-4">
          {SKILLS.map((s) => (
            <div key={s.group}>
              <p className="mb-2 text-sm font-medium">{s.group}</p>
              <div className="flex flex-wrap gap-2">
                {s.items.map((it) => (
                  <span key={it} className={pill}>
                    {it}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <p className={label}>Pendidikan</p>
        <h3 className="font-medium">BINUS University — S1 Data Science</h3>
        <p className={`text-sm ${faint}`}>2024 – 2028 · Beasiswa Full 4 Tahun · IPK di atas 3.0</p>
        <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
          Besar di ekosistem PENABUR (TK–SMA). Peminatan Machine Learning Engineer ✕ AI Engineer.
          Sertifikasi: NVIDIA Deep Learning, AWS, RevoU, IELTS 6.5.
        </p>
      </section>

      <section className={card}>
        <p className={label}>Highlight Prestasi</p>
        <ul className="space-y-2">
          {ACHIEVEMENTS.map((a) => (
            <li key={a} className={`flex gap-2 text-sm leading-relaxed ${muted}`}>
              <span className={faint}>—</span>
              {a}
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/"
        className={`${card} block text-center transition-transform hover:-translate-y-0.5`}
      >
        <p className="font-medium">Mau gali lebih dalam?</p>
        <p className={`mt-1 text-sm ${muted}`}>Ngobrol langsung sama AI Nemi — tanya apa aja →</p>
      </Link>
    </PageShell>
  );
}
