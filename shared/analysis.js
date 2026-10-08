export const MAX_TEXT = 30000;
export const MIN_TEXT = 80;

const stopWords = new Set(`a an and are as at be been by can company candidate candidates career description do for from full have has in into is it job join looking must of on or our position preferred required requirements responsibility responsibilities role should team teams that the their this to us use using we will with work working you your years year experience including ability strong excellent knowledge skills skill other related relevant new minimum qualification qualifications develop build ensure support seeking would well about across all also such through within opportunity equal employer need needs able one two three day apply please benefits salary remote hybrid location based`.split(' '));
const skills = ['React', 'JavaScript', 'TypeScript', 'Node.js', 'Python', 'Java', 'C++', 'C#', '.NET', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'HTML', 'CSS', 'Next.js', 'Vue', 'Angular', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Git', 'GraphQL', 'REST', 'CI/CD', 'Agile', 'Scrum', 'Figma', 'Excel', 'Power BI', 'Tableau', 'Salesforce', 'SAP', 'SEO', 'Google Analytics', 'project management', 'stakeholder management', 'customer service', 'data analysis', 'machine learning', 'communication', 'leadership', 'accessibility', 'testing', 'Jest', 'Playwright', 'budgeting', 'accounting', 'marketing', 'sales', 'recruitment'];

export function normalize(text) {
  return text.toLowerCase().replace(/node\s*\.?\s*js/g, 'node.js').replace(/react\s*\.?\s*js/g, 'react').replace(/postgres\b/g, 'postgresql').replace(/\s+/g, ' ').trim();
}

export function contains(text, term) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(normalize(text));
}

export function validateInputs(resume, jobDescription, requirements = '') {
  for (const [label, value] of [['Resume', resume], ['Job description', jobDescription]]) {
    if (typeof value !== 'string' || value.trim().length < MIN_TEXT) throw new Error(`${label} must contain at least ${MIN_TEXT} characters.`);
    if (value.length > MAX_TEXT) throw new Error(`${label} must be ${MAX_TEXT.toLocaleString()} characters or fewer.`);
  }
  if (typeof requirements !== 'string' || requirements.length > 5000) throw new Error('Requirements must be text of 5,000 characters or fewer.');
}

export function extractKeywords(jobDescription, requirements = '') {
  const text = `${jobDescription}\n${requirements}`;
  const known = skills.filter(skill => contains(text, skill));
  const explicit = requirements.split(/[\n;,]/).map(s => s.replace(/^\s*[-*•]\s*/, '').trim()).filter(s => s.length > 1 && s.length <= 80);
  const counts = new Map();
  for (const word of normalize(text).match(/[\p{L}][\p{L}\p{N}+#.-]{2,}/gu) || []) {
    if (!stopWords.has(word) && !known.some(skill => contains(skill, word))) counts.set(word, (counts.get(word) || 0) + 1);
  }
  // ponytail: literal English term matching; use AI review for semantic requirements and other languages.
  const frequent = [...counts].sort((a, b) => b[1] - a[1]).slice(0, Math.max(5, 18 - known.length)).map(([word]) => word);
  return [...new Set([...explicit, ...known, ...frequent].map(normalize))].slice(0, 40).map(term => ({ term, required: explicit.some(s => normalize(s) === term) || contains(requirements, term) }));
}

export function analyze(resume, jobDescription, requirements = '') {
  validateInputs(resume, jobDescription, requirements);
  const keywords = extractKeywords(jobDescription, requirements).map(item => ({ ...item, matched: contains(resume, item.term) }));
  const totalWeight = keywords.reduce((n, k) => n + (k.required ? 2 : 1), 0);
  const matchedWeight = keywords.reduce((n, k) => n + (k.matched ? (k.required ? 2 : 1) : 0), 0);
  const keywordScore = totalWeight ? Math.round(100 * matchedWeight / totalWeight) : 0;
  const lines = resume.split('\n');
  const hasHeading = expression => lines.some(line => expression.test(line.trim()));
  const checks = [
    { name: 'Contact email', pass: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(resume), detail: 'Include a readable email address in the document body.' },
    { name: 'Experience section', pass: hasHeading(/^(?:work |professional |employment )?(?:experience|employment)(?:\s*:)?$/i), detail: 'Use a standard heading such as Experience or Work Experience.' },
    { name: 'Education section', pass: hasHeading(/^education(?:\s*:)?$/i), detail: 'Use an Education heading when you have education to list.' },
    { name: 'Skills section', pass: hasHeading(/^(?:technical |core )?(?:skills|competencies)(?:\s*:)?$/i), detail: 'List skills you actually have under a Skills heading.' },
    { name: 'Readable length', pass: resume.trim().split(/\s+/).length >= 150 && resume.trim().split(/\s+/).length <= 1200, detail: 'A typical resume has 150–1,200 words. Appropriate length varies by career.' },
    { name: 'Clean text', pass: !/[�\u0000]/.test(resume) && !/\S{100}/.test(resume), detail: 'Check the extracted text for corrupted characters or joined words.' },
  ];
  const structureScore = Math.round(100 * checks.filter(c => c.pass).length / checks.length);
  const quantified = /\b\d+(?:\.\d+)?\s*(?:%|percent|customers|users|clients|projects|hours|million|billion)\b|\d+\s*%|[$€£]\s*\d/i.test(resume);
  const action = /\b(built|led|delivered|improved|reduced|increased|managed|implemented|designed|developed|created|launched|resolved|automated|trained)\b/i.test(resume);
  const evidenceScore = (quantified ? 50 : 0) + (action ? 50 : 0);
  const score = Math.round(keywordScore * .65 + structureScore * .25 + evidenceScore * .1);
  const suggestions = checks.filter(c => !c.pass).map(c => c.detail);
  if (!quantified) suggestions.push('Where you have supporting evidence, add measurable outcomes. Do not invent numbers.');
  if (!action) suggestions.push('Describe your contributions with clear action verbs and concrete outcomes.');
  const missing = keywords.filter(k => !k.matched);
  if (missing.length) suggestions.unshift(`Review missing terms: ${missing.slice(0, 6).map(k => k.term).join(', ')}. Add them only if supported by your experience.`);
  return { score, keywordScore, structureScore, evidenceScore, keywords, checks, suggestions, wordCount: resume.trim().split(/\s+/).length, matchedCount: keywords.filter(k => k.matched).length, quantified, action };
}

export function cleanResume(resume) {
  const headings = new Map([
    ['professional experience', 'EXPERIENCE'], ['work experience', 'EXPERIENCE'], ['employment history', 'EXPERIENCE'], ['experience', 'EXPERIENCE'],
    ['education', 'EDUCATION'], ['technical skills', 'SKILLS'], ['core competencies', 'SKILLS'], ['skills', 'SKILLS'],
    ['professional summary', 'SUMMARY'], ['summary', 'SUMMARY'], ['projects', 'PROJECTS'], ['certifications', 'CERTIFICATIONS'],
  ]);
  return resume.replace(/\r\n?/g, '\n').split('\n').map(line => {
    const trimmed = line.trim().replace(/[\t ]+/g, ' ');
    return headings.get(trimmed.toLowerCase().replace(/:$/, '')) || trimmed.replace(/^[•●▪◦]\s*/, '- ');
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
