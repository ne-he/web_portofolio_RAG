"use client";

import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/components/layout/ThemeProvider";

type Project = {
  name: string;
  tag: string;
  desc: string;
  live?: string;
  repo?: string;
  /** Shown instead of a live link when there is no web demo on purpose. */
  note?: string;
  /** One more link, e.g. a no-login demo. */
  extra?: { label: string; href: string };
};

// Same facts as the knowledge base (cv-data/projects) and the other two portos,
// ICEBERG and ARMORY. Change a number here only after it changes at the source.
const GROUPS: { title: string; items: Project[] }[] = [
  {
    title: "Projek utama",
    items: [
      {
        name: "VERDICT ANALYST",
        tag: "Agentic AI · Causal analytics",
        desc: "Agen analis data yang jalanin kodenya sendiri di sandbox Docker terkunci, lalu menghitung ulang setiap angka dengan cara kedua (pandas lawan DuckDB SQL). Pertanyaan sebab-akibat dijawab engine statistik deterministik, bukan LLM.",
        live: "https://agentic-verdict-sand.vercel.app/",
        repo: "https://github.com/ne-he/agentic_verdict",
      },
      {
        name: "FinSight v2",
        tag: "GenAI · RAG laporan SEC 10-K",
        desc: "Jawaban cuma dari laporan 10-K, disitasi sampai ke bagiannya, atau menolak kalau laporannya tidak mendukung. Retrieval hybrid, hit-rate@6 18/18, penolakan di luar cakupan 4/4, nol penolakan palsu.",
        live: "https://finsight-v2-nine.vercel.app/",
        repo: "https://github.com/ne-he/finsight-v2",
      },
      {
        name: "Feature Store MVP",
        tag: "Data engineering · MLOps",
        desc: "Feature store e-commerce end to end: 23 fitur per user, PostgreSQL sebagai offline store, Redis sebagai online store, disajikan lewat FastAPI, dengan pemantauan drift Evidently.",
        live: "https://ne-he-feature-store-mvp.hf.space/",
        repo: "https://github.com/ne-he/Feature_shopz",
      },
      {
        name: "PULSE",
        tag: "MLOps · Streaming ML",
        desc: "Kualitas udara Jakarta setelah model naik produksi: belajar di tiap event, retrain sendiri saat data bergeser, dan menulis ulang model card-nya sendiri.",
        repo: "https://github.com/ne-he/pulse",
        note: "Demo lokal, satu perintah",
      },
      {
        name: "PhishGuard v2",
        tag: "ML · Security",
        desc: "Deteksi URL phishing berlapis: blocklist, allowlist, lalu model MiniLM plus 20 fitur leksikal. Akurasi 95,7% dan recall 95,8% di holdout 1.000 URL, kelemahannya ikut dipublikasikan.",
        live: "https://url-detection-one.vercel.app/",
        repo: "https://github.com/ne-he/URL_Detection",
      },
      {
        name: "NemVision",
        tag: "Deep learning · Computer vision",
        desc: "Tiga CNN pretrained dibandingkan di dataset sampah TrashNet. ResNet50 menang dengan akurasi test 91,6%, dipasang live dengan heatmap Grad-CAM.",
        live: "https://deep-learning-imageclassif.vercel.app/",
        repo: "https://github.com/ne-he/Deep_Learning_imageclassif",
      },
      {
        name: "Phone Addiction Predictor v2",
        tag: "ML engineering",
        desc: "CatBoost yang memberi skor kecanduan HP 1 sampai 10 dari 19 pertanyaan, dengan penjelasan SHAP dan satu Preprocessor untuk training dan serving.",
        live: "https://addictv2.vercel.app/",
        repo: "https://github.com/ne-he/Addictv2",
      },
    ],
  },
  {
    title: "Produk & web",
    items: [
      {
        name: "KENNETH",
        tag: "Projek venture · Mobile web app",
        desc: "Cek seberapa penuh parkir mall dan kampus BINUS di Jakarta sebelum berangkat. Projek kelompok Venture Creation: tim menentukan produk dan bisnisnya, Nemi yang membangun app-nya. Datanya disimulasikan.",
        live: "https://kenneth-park.web.app/",
        repo: "https://github.com/ne-he/kenneth",
      },
      {
        name: "Ask Nemi",
        tag: "GenAI · RAG",
        desc: "Chatbot ini: CV yang diajak ngobrol, dijawab dari knowledge base yang dikurasi Nemi sendiri, dengan confidence gate supaya tidak mengarang.",
        live: "https://web-portofolio-rag.vercel.app/",
        repo: "https://github.com/ne-he/web_portofolio_RAG",
      },
      {
        name: "ICEBERG",
        tag: "Web CV 3D",
        desc: "Web CV yang di-scroll turun menembus gunung es 3D, React Three Fiber dengan aset Blender. Chat di dalamnya pakai backend Ask Nemi.",
        live: "https://nemiiceberg.vercel.app/",
        repo: "https://github.com/ne-he/iceberg",
      },
      {
        name: "ARMORY",
        tag: "Portfolio sinematik",
        desc: "Aula gelap yang menyala saat di-scroll, lalu tiap projek keluar sebagai unit dengan stack dan link aslinya. HTML, CSS, dan JavaScript murni.",
        live: "https://armory-rouge.vercel.app/",
        repo: "https://github.com/ne-he/armory",
      },
      {
        name: "Family Todolist",
        tag: "Full-stack web app",
        desc: "Papan tugas bersama untuk satu keluarga: papan pribadi tiap anggota, papan bersama dengan drag-to-assign, komentar, dan update realtime lewat Supabase. App aslinya butuh login, jadi coba lewat mode spectate dengan data contoh.",
        live: "https://partai-wilhelmus.vercel.app/",
        extra: { label: "Spectate tanpa akun ↗", href: "https://partai-wilhelmus.vercel.app/spectate" },
        repo: "https://github.com/ne-he/Partai_Wilhelmus",
      },
    ],
  },
  {
    title: "Projek lain",
    items: [
      {
        name: "E-Commerce Sales Analysis",
        tag: "Analisis data",
        desc: "20.848 pesanan dibaca untuk tiga keputusan pemilik toko: produk mana yang layak didanai, wilayah mana yang gagal, dan di mana margin bocor.",
        live: "https://dashboard-nehemiah.vercel.app/",
        repo: "https://github.com/ne-he/nemi-dashboard",
      },
      {
        name: "Suara Rakyat",
        tag: "NLP · Projek kelompok kuliah",
        desc: "Membaca nada 617.722 ulasan aplikasi layanan publik Indonesia dengan tiga model sentimen, IndoBERTweet sebagai pembanding.",
        live: "https://suara-rakyat-xi.vercel.app/",
        repo: "https://github.com/ne-he/suara-rakyat",
      },
      {
        name: "Clash of BaNG",
        tag: "HCI Lab",
        desc: "Website komunitas game, projek akhir mata kuliah Human-Computer Interaction.",
        live: "https://web-hci-final-clash-of-bang.vercel.app/",
        repo: "https://github.com/ne-he/hci_lab",
      },
      {
        name: "SimpleNotes",
        tag: "iOS · SwiftUI",
        desc: "Aplikasi catatan SwiftUI dengan logika inti yang dipisah dari UI supaya bisa di-unit test penuh.",
        repo: "https://github.com/ne-he/swift_UI_notes",
        note: "Aplikasi iOS",
      },
    ],
  },
];

export default function ProjectsPage() {
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
    <PageShell title="Projects">
      <p className={`-mt-4 text-[15px] leading-relaxed ${muted}`}>
        Semua link di bawah ini hidup. Mau versi yang lebih seru? Buka{" "}
        <a href="https://nemiiceberg.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          ICEBERG
        </a>{" "}
        atau{" "}
        <a href="https://armory-rouge.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          ARMORY
        </a>
        , atau tanya langsung ke AI Nemi.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title} className={card}>
          <p className={label}>{g.title}</p>
          <div className="space-y-6">
            {g.items.map((p) => (
              <div key={p.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="font-medium">{p.name}</h3>
                  <span className={`text-xs ${faint}`}>{p.tag}</span>
                </div>
                <p className={`mt-1 text-sm leading-relaxed ${muted}`}>{p.desc}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.live ? (
                    <a href={p.live} target="_blank" rel="noopener noreferrer" className={pill}>
                      Live ↗
                    </a>
                  ) : (
                    <span className={`${pill} opacity-60`}>{p.note}</span>
                  )}
                  {p.extra && (
                    <a href={p.extra.href} target="_blank" rel="noopener noreferrer" className={pill}>
                      {p.extra.label}
                    </a>
                  )}
                  {p.repo && (
                    <a href={p.repo} target="_blank" rel="noopener noreferrer" className={pill}>
                      Repo ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
