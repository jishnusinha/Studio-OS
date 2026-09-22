import type { ParsedScene, ParsedScript } from './types.js';

const SCENE_HEADING =
  /^(?:\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|E\/I)[\.\s].+)$/i;
const CHARACTER_CUE = /^([A-Z][A-Z0-9 \-'.]{1,40})$/;
const LOCATION_FROM_HEADING =
  /^(?:INT|EXT|EST|I\/E|E\/I)[\.\s]+(.+?)(?:\s+[-–—]\s+|\s+$)/i;

function isSceneHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('.') && /^[A-Z]/.test(t.slice(1))) return true;
  return /^(INT|EXT|EST|I\/E|E\/I)[\.\s]/i.test(t);
}

function isCharacterCue(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 40) return false;
  if (/^(INT|EXT|EST|FADE|CUT|SMASH|DISSOLVE|TITLE)/i.test(t)) return false;
  if (t.includes('(') && !/^[A-Z][A-Z0-9 \-'.]+(\s*\(.*\))?$/.test(t)) return false;
  const bare = t.replace(/\s*\(.*\)\s*$/, '').trim();
  return CHARACTER_CUE.test(bare) && bare.split(/\s+/).length <= 4;
}

function locationFromHeading(heading: string): string | undefined {
  const m = LOCATION_FROM_HEADING.exec(heading.trim());
  if (!m?.[1]) return undefined;
  return m[1].replace(/\s+[-–—].*$/, '').trim();
}

/** Parse Fountain (and Fountain-ish plain screenplay text). */
export function parseFountain(input: string): ParsedScript {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const scenes: ParsedScene[] = [];
  const characterSet = new Set<string>();
  const locationSet = new Set<string>();

  let title: string | undefined;
  let current: ParsedScene | null = null;
  const actionBuf: string[] = [];

  const flushAction = () => {
    if (!current || actionBuf.length === 0) return;
    const summary = actionBuf.join(' ').replace(/\s+/g, ' ').trim();
    if (summary) {
      current.summary = current.summary
        ? `${current.summary} ${summary}`.trim()
        : summary;
    }
    actionBuf.length = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushAction();
      continue;
    }

    if (/^Title:\s*/i.test(trimmed)) {
      title = trimmed.replace(/^Title:\s*/i, '').trim();
      continue;
    }

    if (isSceneHeading(trimmed) || SCENE_HEADING.test(trimmed)) {
      flushAction();
      const heading = trimmed.replace(/^\./, '').trim();
      current = { heading, summary: '', characters: [] };
      scenes.push(current);
      const loc = locationFromHeading(heading);
      if (loc) locationSet.add(loc);
      continue;
    }

    if (isCharacterCue(trimmed)) {
      flushAction();
      const name = trimmed.replace(/\s*\(.*\)\s*$/, '').trim();
      characterSet.add(name);
      if (current && !current.characters.includes(name)) {
        current.characters.push(name);
      }
      continue;
    }

    if (current) {
      actionBuf.push(trimmed);
    }
  }
  flushAction();

  if (scenes.length === 0 && input.trim()) {
    scenes.push({
      heading: 'INT. LOCATION - DAY',
      summary: input.trim().slice(0, 500),
      characters: [...characterSet],
    });
  }

  return {
    format: 'fountain',
    title,
    text: input,
    scenes,
    characters: [...characterSet],
    locations: [...locationSet],
  };
}
