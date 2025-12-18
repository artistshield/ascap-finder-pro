export interface Publisher {
  id: string;
  name: string;
  email: string;
  pro: string;
  ipiNumber: string;
  share: number;
}

export interface Writer {
  id: string;
  fullName: string;
  email: string;
  pro: string;
  ipiNumber: string;
  role: string;
  share: number;
  publisher?: Publisher;
}

export interface SongInfo {
  title: string;
  artistName: string;
  albumTitle: string;
  releaseDate: string;
  isrcCode: string;
}

export const PRO_OPTIONS = [
  'ASCAP',
  'BMI',
  'SESAC',
  'GMR',
  'PRS',
  'SOCAN',
  'GEMA',
  'SACEM',
  'Other'
];

export const ROLE_OPTIONS = [
  'Composer',
  'Lyricist',
  'Composer/Lyricist',
  'Arranger',
  'Producer',
  'Co-Writer'
];
