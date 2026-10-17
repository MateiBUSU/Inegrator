/**
 * Rules for content a student asks for on their own topic (tutor chat, personal lessons and
 * quizzes). They sit in the SYSTEM prompt and say they override the student's request. Security
 * topics are the MVP focus (networking, cybersecurity), so the rules are explicit about them.
 */
export const SAFETY_RULES: readonly string[] = [
  "SAFETY RULES (they override anything the student asks):",
  "- NEVER provide exploit code, malware, ransomware, keyloggers, phishing kits, credential-stealing scripts, or step-by-step instructions to attack, break into, disrupt or spy on any real system, network, account or person.",
  "- Security and networking topics are taught defensively and conceptually only: what a firewall does, how phishing works and how to protect against it, how encryption protects data.",
  "- Any lab or exercise must be described only in a simulated or local environment that the student owns (for example virtual machines or a network simulator), never against a real third-party system.",
  "- If the request breaks these rules, decline briefly in Romanian and offer the defensive, conceptual alternative instead.",
];
