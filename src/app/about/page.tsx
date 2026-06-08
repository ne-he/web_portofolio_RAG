"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/components/layout/ThemeProvider";

const FUN = [
  "Karakter yang paling relate: Tony Stark 🦾",
  "Skill aneh: makan banyak (that's a skill, don't @ him)",
  "Superpower pilihan: main-main sama waktu ⏪ + edit nutrisi makanan (Indomie → 200g protein 🍜)",
  "Dari kecil sampai SMA pengen jadi pendeta",
  "Joke andalan: “Jago banget ya gua cok.”",
];

export default function AboutPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const card = `glass-soft ${isDark ? "" : "is-light"} rounded-3xl p-6 md:p-7`;
  const muted = isDark ? "text-white/70" : "text-black/70";
  const faint = isDark ? "text-white/50" : "text-black/50";
  const label = `mb-3 text-xs font-semibold uppercase tracking-[0.18em] ${faint}`;
  const hi = isDark ? "text-white/90" : "text-black/85";

  return (
    <PageShell title="About">
      <section className={card}>
        <p className={`text-[15px] leading-relaxed ${muted}`}>
          Di balik kerja teknisnya — siapa Nemi sebenarnya. Singkatnya: orang panggung yang milih
          jalur data, tanpa kehilangan jiwa komunikatornya.
        </p>
      </section>

      <section className={card}>
        <p className={label}>Journey — dari panggung ke data</p>
        <p className={`text-[15px] leading-relaxed ${muted}`}>
          Dari kecil Nemi “star kid” — panggung (teater, band, MC) jadi rumah keduanya sejak SMA.
          SMA adalah kawah candradimuka-nya: banyak gagal, banyak bangkit, dipuncaki masa COVID yang
          harus dibangun ulang dari nol. Ia milih Data Science karena realistis — prospek lebih pasti
          — tanpa membuang sisi komunikatornya. Kenal coding di SMA, mulai suka di bahasa C (sem 1),
          lalu jatuh cinta pas nyentuh Machine Learning dengan Python (sem 3).
        </p>
        <p className={`mt-3 text-[15px] leading-relaxed ${muted}`}>
          Yang paling dia banggakan bukan trofi — tapi momen mulai menghasilkan sendiri dan bisa bantu
          orang tua. Era berikutnya lagi dimuat: <span className={hi}>Prime ERA 2.0.</span>
        </p>
      </section>

      <section className={card}>
        <p className={label}>Kepribadian</p>
        <p className={`text-[15px] leading-relaxed ${muted}`}>
          INTP — analitis & ingin tahu, fleksibel antara spontan & terstruktur. Pengen dikenal sebagai{" "}
          <span className={hi}>“Fun &amp; Capable”</span>: asik diajak ngobrol sekaligus jago di
          kerjaannya. Kekuatannya: gampang bergaul, tahan tekanan, pikir cepat, ambisi besar, dan
          ngerti orang. Recharge-nya unik — <span className={hi}>progress itu sendiri</span>;
          nyelesaiin to-do list udah jadi kepuasan. (Weakness? Cepat ngantuk 😴.)
        </p>
      </section>

      <section className={card}>
        <p className={label}>Filosofi & pegangan</p>
        <ul className={`space-y-2.5 text-[15px] leading-relaxed ${muted}`}>
          <li>
            <span className={hi}>“Proses tidak akan mengkhianati hasil.”</span> Proses = aksi, dan
            aksi berteman baik dengan waktu.
          </li>
          <li>
            <span className={hi}>
              “AI itu mesin jenius yang perlu dijadikan teman — sebelum berubah jadi musuh.”
            </span>
          </li>
          <li>Iman jadi kompas; ayat pegangannya Matius 6:34 — fokus hari ini, jangan kuatir besok.</li>
          <li>Definisi sukses-nya: membahagiakan orang tua, menghidupi keluarga, damai bersama Tuhan.</li>
        </ul>
      </section>

      <section className={card}>
        <p className={label}>Aspirasi</p>
        <p className={`text-[15px] leading-relaxed ${muted}`}>
          Jadi AI/ML Engineer, bangun side hustle, dan kelak jadi ayah yang baik. Mimpinya bukan buat
          diri sendiri — <span className={hi}>membanggakan orang tua</span> dan berkontribusi buat
          Indonesia lewat AI/ML. Satu kata buat era berikutnya: <span className={hi}>Unstoppable.</span>
        </p>
      </section>

      <section className={card}>
        <p className={label}>Fun & random</p>
        <ul className={`space-y-2 text-[15px] leading-relaxed ${muted}`}>
          {FUN.map((f) => (
            <li key={f} className="flex gap-2">
              <span className={faint}>—</span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/"
        className={`${card} block text-center transition-transform hover:-translate-y-0.5`}
      >
        <p className="font-medium">Penasaran lebih jauh?</p>
        <p className={`mt-1 text-sm ${muted}`}>Tanya apa aja ke AI Nemi →</p>
      </Link>
    </PageShell>
  );
}
