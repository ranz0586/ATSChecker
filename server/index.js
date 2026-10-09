import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, cleanResume, validateInputs, MAX_TEXT } from '../shared/analysis.js';
import { extractResume, createDocx } from './files.js';
import { reviewWithAI, getAIConfig } from './ai.js';
import { resolveResumeCountry } from '../shared/resume-format.js';

export function createApp({ env = process.env, fetchImpl = fetch } = {}) {
  let aiConfig;
  try { aiConfig = getAIConfig(env); }
  catch (error) { aiConfig = { error: error.message }; }
  const app = express();
  const hosted = env.VERCEL === '1';
  if (hosted) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    next();
  });
  app.get('/api/config', (req, res) => res.json({ aiAvailable: Boolean(aiConfig.apiKey), aiProvider: aiConfig.provider || null,
    aiProviderLabel: aiConfig.label || null, aiConfigError: aiConfig.error || null, maxFileSize: 5 * 1024 * 1024 }));
  app.post('/api/extract', express.raw({ type: 'application/octet-stream', limit: '5mb' }), async (req, res) => {
    try {
      const filename = decodeURIComponent(req.get('x-file-name') || '');
      res.json(await extractResume(req.body, filename));
    } catch (error) { res.status(400).json({ error: error.message.startsWith('Upload') || /resume|file|text|PDF|DOCX|character/i.test(error.message) ? error.message : 'Could not read this file. Try another file or paste your resume.' }); }
  });
  app.use(express.json({ limit: '160kb' }));
  let aiBusy = false;
  let aiRequests = 0;
  let aiWindowStart = Date.now();
  app.post('/api/analyze', async (req, res) => {
    const { resume, jobDescription, requirements = '', targetCountry = 'auto', useAI = false, aiConsent = false, aiProvider } = req.body || {};
    let country;
    try { validateInputs(resume, jobDescription, requirements); country = resolveResumeCountry(targetCountry, jobDescription); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (typeof useAI !== 'boolean' || typeof aiConsent !== 'boolean') return res.status(400).json({ error: 'AI options must be true or false.' });
    if (useAI && !aiConsent) return res.status(400).json({ error: 'Consent is required before sending your documents for AI review.' });
    if (useAI && !aiConfig.apiKey) return res.status(503).json({ error: aiConfig.error || 'AI review is not configured. Set a key for the selected provider on the server or use the local review.' });
    if (useAI && aiProvider !== aiConfig.provider) return res.status(400).json({ error: 'The AI provider has changed or was not confirmed. Reload the page and enable AI review again before sending documents.' });
    if (useAI && aiBusy) return res.status(429).json({ error: 'An AI review is already running. Please try again shortly.' });
    if (hosted && useAI) {
      // shortcut: 10 AI attempts/hour per instance; use an edge/provider quota for a limit shared across instances.
      if (Date.now() - aiWindowStart >= 3600000) { aiWindowStart = Date.now(); aiRequests = 0; }
      if (aiRequests >= 10) return res.status(429).json({ error: 'The AI request limit was reached. Use local review or try again in an hour.' });
      aiRequests++;
    }
    const original = analyze(resume, jobDescription, requirements);
    let ai = null;
    let aiError = null;
    if (useAI) {
      // ponytail: one AI request at a time on this local server; add per-user quotas when deploying for multiple users.
      aiBusy = true;
      try { ai = await reviewWithAI({ resume, jobDescription, requirements, targetCountry: country }, { ...aiConfig, fetchImpl }); }
      catch (error) { aiError = error.name === 'TimeoutError' ? 'AI review timed out. Local results are still available.' : error.message; }
      finally { aiBusy = false; }
    }
    const revisedResume = ai?.revisedResume || cleanResume(resume);
    res.json({ original, revised: analyze(revisedResume, jobDescription, requirements), revisedResume, ai, aiError, targetCountry: country,
      aiProvider: ai ? aiConfig.provider : null, aiProviderLabel: ai ? aiConfig.label : null,
      changes: ai?.changes || ['Standardized recognized section headings, bullets, and whitespace. Original qualifications and accomplishments were preserved.'],
    });
  });
  app.post('/api/export', async (req, res) => {
    const text = req.body?.text;
    const { targetCountry = 'international' } = req.body || {};
    let country;
    try { country = resolveResumeCountry(targetCountry); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (typeof text !== 'string' || text.trim().length < 80 || text.length > MAX_TEXT) return res.status(400).json({ error: 'Resume must contain 80–30,000 characters.' });
    try {
      res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.set('Content-Disposition', 'attachment; filename="aligned-resume.docx"');
      res.send(await createDocx(text, country));
    } catch { res.status(500).json({ error: 'Could not export the resume. Try downloading TXT instead.' }); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The upload or document is too large. Files must be 5 MB or smaller.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid request data.' });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

async function start() {
  const app = createApp();
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = resolve('dist');
    if (!existsSync(dist)) throw new Error('Run npm run build before starting the production server.');
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '127.0.0.1', () => console.log(`Align is ready at http://localhost:${port}`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
