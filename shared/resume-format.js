export const RESUME_FORMATS = {
  international: { label: 'International / other', paper: 'A4', spelling: 'consistent original English spelling' },
  NZ: { label: 'New Zealand', paper: 'A4', spelling: 'New Zealand English' },
  SG: { label: 'Singapore', paper: 'A4', spelling: 'British English' },
  US: { label: 'United States', paper: 'Letter', spelling: 'American English' },
  CA: { label: 'Canada', paper: 'Letter', spelling: 'Canadian English' },
  GB: { label: 'United Kingdom', paper: 'A4', spelling: 'British English' },
  AU: { label: 'Australia', paper: 'A4', spelling: 'Australian English' },
  IN: { label: 'India', paper: 'A4', spelling: 'British English' },
  PH: { label: 'Philippines', paper: 'A4', spelling: 'American English' },
  AE: { label: 'United Arab Emirates', paper: 'A4', spelling: 'consistent original English spelling' },
};

export function detectJobCountry(jobDescription) {
  const text = jobDescription.replace(/\s+/g, ' ');
  const matches = Object.entries(RESUME_FORMATS).filter(([code, format]) => code !== 'international' && new RegExp(`\\b${format.label}\\b`, 'i').test(text));
  return matches.length === 1 ? matches[0][0] : null;
}

export function resolveResumeCountry(country = 'auto', jobDescription = '') {
  if (country === 'auto') return detectJobCountry(jobDescription) || 'international';
  if (typeof country !== 'string' || !Object.hasOwn(RESUME_FORMATS, country)) throw new Error('Choose a supported target country or International / other.');
  return country;
}

export function getResumeFormat(country = 'international') {
  return RESUME_FORMATS[resolveResumeCountry(country)];
}
