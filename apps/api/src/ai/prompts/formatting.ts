/**
 * Output formatting rule shared by every prompt whose text a student or teacher reads. The web
 * app renders plain Markdown only (headings, paragraphs, lists, bold/italic, inline code, fenced
 * code blocks): no tables and no math, which would otherwise show up as raw pipes and dollar signs.
 */
export const FORMAT_RULE =
  "Formatting: use plain Markdown only. Do NOT use Markdown tables (no pipe | syntax) and NOT LaTeX or math notation (no $...$ or $$...$$). Express comparisons as short lists or paragraphs, and write formulas in plain words or simple inline text such as O(V+E) without any dollar signs.";
