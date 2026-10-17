// Small hardcoded stopword lists (Romanian + English) for chunk retrieval. Stored without
// diacritics: the retrieval tokenizer strips diacritics before comparing.
//
// English words that are also C++/Python keywords (for, if, and, or, not, is, as, from, with,
// do) are deliberately NOT stopwords: in a programming course they carry meaning.

// prettier-ignore
const ROMANIAN = [
  "a", "ai", "al", "ale", "am", "an", "ar", "au", "ca", "care", "cat", "ce", "cei", "cel",
  "cu", "cum", "da", "dar", "de", "din", "deci", "daca", "dupa", "e", "el", "ea", "ei", "ele",
  "este", "esti", "eu", "fi", "fie", "fost", "fara", "i", "ii", "in", "intre", "la", "le", "li",
  "lor", "lui", "mai", "mi", "mult", "ne", "nici", "noi", "nu", "o", "ori", "pe", "pana",
  "pentru", "prin", "sa", "se", "si", "sunt", "sau", "spre", "sub", "tot", "toate", "tu", "un",
  "una", "unei", "unor", "unui", "va", "vi", "voi", "vor", "vreo", "acea", "acel", "acest",
  "aceasta", "acestea", "acesta", "aceste", "asa", "asta", "aici", "acolo", "cand", "unde",
  "atunci", "doar", "inca", "foarte", "poate", "putea", "fiecare", "oricare", "nimic",
];

// prettier-ignore
const ENGLISH = [
  "a", "about", "after", "all", "also", "am", "an", "any", "are", "at", "be", "because", "been",
  "but", "by", "can", "could", "did", "does", "had", "has", "have", "he", "her", "his", "how",
  "i", "into", "it", "its", "just", "me", "more", "my", "no", "of", "on", "our", "out", "she",
  "so", "some", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "to", "up", "us", "was", "we", "were", "what", "when", "where", "which", "who", "will",
  "would", "you", "your",
];

export const STOPWORDS: ReadonlySet<string> = new Set([...ROMANIAN, ...ENGLISH]);
