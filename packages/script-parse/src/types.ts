export type ScriptFormat = 'fountain' | 'fdx' | 'pdf' | 'docx' | 'txt' | 'unknown';

export interface ParsedScene {
  heading: string;
  summary: string;
  characters: string[];
}

export interface ParsedScript {
  format: ScriptFormat;
  title?: string;
  text: string;
  scenes: ParsedScene[];
  characters: string[];
  locations: string[];
}
