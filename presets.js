// presets.js
window.HOOK_MILL_PRESETS = (() => {
  const LENS_SNIPPETS = {
    NONE: "",
    COUNTRY: 'Blue-collar country tropes; diners, trucks, cheap beer; playful, not mean.',
    VINTAGE: 'Pretend this is a 1972 lost 7-inch. [Style: Vintage Soul] [Tempo: 92] [Key: A minor]. Slightly retro diction; avoid modern brand names.',
    PUNK: '140–170 BPM, short lines, barked chant. Humor > coherence; keep lines punchy.'
  };

  const PRESET_SYSTEMS = {
    FULL: `Treat the premise with professional songwriting craft. Output Suno-ready sections. At least 3 verses, evolving chorus, and a bridge. Optional intro, pre-chorus, outro. Keep it performable straight; humor from premise and phrasing, not sloppy meter.

Output ONLY:
[Style: <genre> | Key: <key> | Tempo: <bpm> | Time: <meter>]
[Intro] … (optional, 1–2 lines)
[Verse 1] 4–6 lines
[Pre-Chorus] (optional, 2–4 lines)
[Chorus] 2–4 lines, chantable
[Verse 2] 4–6 lines
[Chorus] slight variation / escalation
[Verse 3] 4–6 lines
[Bridge] 2–4 lines (contrast, set up final chorus)
[Chorus] final, strongest (may combine prior ideas)
[Outro] (optional, 1–2 lines)

Rules: consistent meter & syllables; internal rhyme encouraged; chorus evolves; ≤ ~220 words total; no explanations or extra text.`,

    TRUNCATED: `Write a very short meme song for Suno: one [Verse] (2–4 lines) and one [Chorus] (2–4 lines). Chorus must be chantable/repeatable. ≤ 60 words total. Include header.

Output:
[Style: <genre> | Key: <key> | Tempo: <bpm> | Time: <meter>]
[Verse] …
[Chorus] …

No extra sections. No explanations.`,

    CHORUS: `Return ONLY a Suno [Chorus] (2–4 lines), chant-ready, ≤ 50 words, plus header.

[Style: <genre> | Key: <key> | Tempo: <bpm> | Time: <meter>]
[Chorus] …`,

    HOOK: `Return ONLY two shocking/funny lines followed by a tiny chant tag. ≤ 35 words total.

[Hook]   line 1   line 2   [Chant] short chant (2–6 words)`,

    TITLE: `Return ONLY a 2–4 word title; no colons/parentheses; PG-13; punchy.

[Title] Your Title`,

    ADD_VERSE: `You are expanding an existing song. Add exactly one [Verse] matching the given lyrics’ meter/rhyme/tone. Do not modify existing text.
Output only the new [Verse].`,

    ADD_BRIDGE: `You are expanding an existing song. Add exactly one [Bridge] that provides contrast and sets up the final chorus. Do not modify existing text.
Output only the new [Bridge].`,
  };

  const REFINE = {
    DEFAULT: `You are polishing a meme-ready lyric for short-form video. Tighten meter, remove filler, improve internal rhyme, and maximize chantability. Keep the original joke/POV. If too long, trim to the shortest version that preserves the punchline. Ensure Suno sections remain intact.
Tasks:
1. Keep or add [Style | Key | Tempo | Time].
2. Standardize labels ([Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Hook] [Chant] [Outro]).
3. Split long lines; avoid tongue-twisters.
4. Keep PG-13 and platform-safe.
Output only the revised lyric in the same bracketed format. No explanations.`,
    SHORTER: `Aggressively compress to the catchiest version (aim ≤ 90 words). Keep the hook; boost punch; simplify diction; preserve bracketed sections. Output lyrics only.`
  };

  const DEFAULTS = {
    model: 'deepseek/deepseek-chat-v3.1:free',
    temperature: 0.9,
    top_p: 0.95,
    max_tokens: 220,
    stop: ["\\n\\n","[END]"],
    preset: 'HOOK',
    lens: 'NONE',
    batchSize: 5,
    charCapOn: true
  };

  const CAPS = {
    FULL: { words: 220, chars: 2000 },
    TRUNCATED: { words: 60, chars: 600 },
    CHORUS: { words: 50, chars: 450 },
    HOOK: { words: 35, chars: 280 },
    TITLE: { words: 8, chars: 64 }
  };

  function buildSystem(preset, lens) {
    const base = PRESET_SYSTEMS[preset];
    const lensNote = lens && lens !== 'NONE' ? `\n\n${LENS_SNIPPETS[lens]}` : '';
    return `${base}${lensNote}`;
  }

  return { LENS_SNIPPETS, PRESET_SYSTEMS, REFINE, DEFAULTS, CAPS, buildSystem };
})();