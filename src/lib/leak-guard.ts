// Output guards for the streamed chat answer.
//
// 1. Internal system notes must never reach a visitor. The old guard only caught
//    a note that opened with "[", but the 25 Sep 2026 audit caught the model
//    paraphrasing it without brackets ("CATATAN: Ada sinyal kuat bahwa potongan
//    ... TIDAK relevan", then "***", then the real answer). Both shapes are
//    dropped now, as long as they sit at the start of the answer.
// 2. No em dash in anything written for Nehemiah, the bot included. The system
//    prompt already asks for that, this is the guarantee.

const NOTE_LEAD = /^\s*(\[|\**\s*catatan\b)/i;
// A lead this short could still grow into a note ("[", "**", "CATA"), so wait.
const MAYBE_NOTE = /^(\[|\**\s*(c(a(t(a(t(a(n)?)?)?)?)?)?)?)$/i;
// After a note, a markdown rule ("***", "---") may still be arriving.
const MAYBE_RULE = /^(\*+|-+|_+)\s*$/;

export function stripEmDash(text: string): string {
  return text.replace(/ ?\u2014 ?/g, ", ");
}

/** Text after one leading note, or null while that note is still open. */
function cutNote(text: string): string | null {
  const lead = text.trimStart();
  if (lead.startsWith("[")) {
    const close = lead.indexOf("]");
    return close === -1 ? null : lead.slice(close + 1);
  }
  const end = lead.search(/\n\s*\n/); // a bare "CATATAN: ..." note ends with its paragraph
  return end === -1 ? null : lead.slice(end);
}

/** Drop blank lines and a markdown rule ("***", "---") left behind by a note. */
function tidy(rest: string): string {
  return rest.replace(/^\s*(?:(?:\*{3,}|-{3,}|_{3,})\s*)?/, "").replace(/^\s+/, "");
}

/**
 * Wraps `send` so a leading internal note is held back and dropped, and every
 * released piece of text has its em dashes replaced.
 */
export function createLeakGuard(send: (text: string) => void) {
  let released = false;
  let afterNote = false;
  let held = "";
  // Trailing spaces and em dashes wait for the next token, so an em dash split
  // across tokens ("jawaban " + "\u2014" + " lanjut") still becomes one clean comma.
  let tail = "";
  const out = (text: string, final = false) => {
    const all = tail + text;
    const keep = final ? "" : (all.match(/[ \u2014]+$/)?.[0] ?? "");
    tail = keep;
    const now = all.slice(0, all.length - keep.length);
    if (now) send(stripEmDash(now));
  };
  return {
    feed(token: string) {
      if (released) return out(token);
      held += token;
      for (;;) {
        const lead = held.trimStart();
        if (!lead) return; // whitespace only, keep holding
        if (afterNote && MAYBE_RULE.test(lead)) return;
        if (lead.length < 10 && MAYBE_NOTE.test(lead)) return;
        if (!NOTE_LEAD.test(lead)) {
          released = true; // normal answer, release everything held
          return out(afterNote ? tidy(held) : held);
        }
        const rest = cutNote(held);
        if (rest === null) return; // note still open, keep holding
        afterNote = true;
        held = tidy(rest);
      }
    },
    /** Call once the model stream ends: drop any note still held, release the rest. */
    end() {
      if (released) return out("", true);
      let rest = held;
      while (NOTE_LEAD.test(rest)) {
        const cut = cutNote(rest);
        rest = cut === null ? "" : tidy(cut);
        afterNote = true;
      }
      released = true;
      out(afterNote ? tidy(rest) : rest, true);
    },
  };
}
