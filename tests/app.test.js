import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, contains, cleanResume, validateInputs } from '../shared/analysis.js';
import { createDocx, extractResume } from '../server/files.js';
import { createApp } from '../server/index.js';
import { reviewWithAI, getAIConfig } from '../server/ai.js';
import JSZip from 'jszip';
import vercelApp from '../api/index.js';
import { execFileSync } from 'node:child_process';

const resume = `Alex Morgan\nalex@example.com\n\nWork Experience\nEngineer | Example | 2022–2025\nBuilt React and Node.js applications for 500 users. Improved performance by 30%. Delivered accessible interfaces using HTML and CSS.\n\nTechnical Skills\nReact, Node.js, JavaScript, HTML, CSS, Git\n\nEducation\nBS Computer Science, Example University 2022\n${'Worked with designers and engineers to deliver customer dashboards. '.repeat(14)}`.trim();
const job = 'Frontend engineer required to build React applications with TypeScript, Node.js, HTML, CSS and Git. Must work with designers to improve accessibility and deliver customer dashboards.';

test('literal matches have boundaries, aliases and safe punctuation', () => {
  assert.equal(contains('JavaScript', 'Java'), false);
  assert.equal(contains('React.js and NodeJS, Postgres', 'React'), true);
  assert.equal(contains('React.js and NodeJS, Postgres', 'Node.js'), true);
  assert.equal(contains('Postgres', 'PostgreSQL'), true);
  assert.equal(contains('C++ and C# and .NET', 'C++'), true);
  assert.equal(contains('accountability', 'account'), false);
});

test('scores reflect missing requirements and never invent qualifications', () => {
  const report = analyze(resume, job, 'React\nTypeScript');
  assert.equal(report.keywords.find(k => k.term === 'typescript').matched, false);
  assert.equal(report.keywords.find(k => k.term === 'typescript').required, true);
  assert.equal(report.checks.every(c => c.pass), true);
  assert.equal(report.evidenceScore, 100);
  assert.ok(analyze(`${resume}\nTypeScript`, job, 'React\nTypeScript').score > report.score);
  const revised = cleanResume(resume);
  assert.match(revised, /\nEXPERIENCE\n/);
  assert.equal(contains(revised, 'TypeScript'), false);
  assert.match(revised, /Example \| 2022–2025/);
  assert.equal(cleanResume(revised), revised);
});

test('text boundaries reject invalid input', () => {
  assert.throws(() => validateInputs('', job), /at least/);
  assert.throws(() => validateInputs(resume, 'x'.repeat(30001)), /fewer/);
  assert.throws(() => validateInputs(resume, job, []), /Requirements/);
});

test('DOCX export preserves facts and can be uploaded again', async () => {
  const buffer = await createDocx(cleanResume(resume));
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const result = await extractResume(buffer, 'resume.docx');
  assert.match(result.text, /alex@example.com/);
  assert.match(result.text, /2022–2025/);
  assert.equal(contains(result.text, 'React'), true);
  assert.equal(contains(result.text, 'TypeScript'), false);
});

test('uploads reject unsupported, malformed, oversized, scanned and binary documents', async () => {
  const text = await extractResume(Buffer.from(resume), 'resume.txt');
  assert.equal(text.text, resume);
  await assert.rejects(() => extractResume(Buffer.from(resume), 'resume.exe'), /Upload/);
  await assert.rejects(() => extractResume(Buffer.from('fake'), 'resume.pdf'), /valid PDF/);
  await assert.rejects(() => extractResume(Buffer.from('fake'), 'resume.docx'), /valid DOCX/);
  await assert.rejects(() => extractResume(Buffer.from('P'), 'resume.docx'), /valid DOCX/);
  await assert.rejects(() => extractResume(Buffer.alloc(6 * 1024 * 1024), 'resume.txt'), /5 MB/);
  await assert.rejects(() => extractResume(Buffer.from('short'), 'resume.txt'), /readable text/);
  await assert.rejects(() => extractResume(Buffer.from(`${resume}\u0000`), 'resume.txt'), /UTF-8/);
  const zip = new JSZip();
  zip.file('word/document.xml', 'a'.repeat(21 * 1024 * 1024));
  await assert.rejects(() => zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then(buffer => extractResume(buffer, 'compressed.docx')), /safety limit/);
});

function makePDF(text) {
  const stream = `BT /F1 10 Tf 40 750 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test('API startup does not require native PDF rendering dependencies', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    const builtin = process.getBuiltinModule;
    process.getBuiltinModule = name => {
      const module = builtin(name);
      if (name !== 'module') return module;
      return { ...module, createRequire: url => {
        const original = module.createRequire(url);
        return Object.assign(id => {
          if (id === '@napi-rs/canvas') throw Error('native canvas unavailable');
          return original(id);
        }, original);
      } };
    };
    await import('./api/index.js');
    const { extractResume } = await import('./server/files.js');
    await extractResume(Buffer.from('Synthetic resume text. '.repeat(10)), 'resume.txt');
    console.log('ready');
  `], { encoding: 'utf8' });
  assert.match(output, /ready/);
});

test('a real selectable-text PDF extracts successfully', async () => {
  const result = await extractResume(makePDF('Alex Morgan alex@example.com Built React applications for 500 users. Skills: React JavaScript HTML CSS. Education: Computer Science.'), 'resume.pdf');
  assert.match(result.text, /Alex Morgan/);
  assert.equal(result.pages, 1);
  await assert.rejects(() => extractResume(makePDF(''), 'scanned.pdf'), /readable text/);
});

test('AI request uses consented data, structured output and no response storage', async () => {
  const expected = { fitScore: 70, summary: 'React experience fits; TypeScript is not evidenced.', strengths: ['React'], gaps: ['TypeScript'], recommendations: ['Verify requirements'], revisedResume: cleanResume(resume), changes: ['Cleaned headings'], cautions: ['Review all facts'] };
  const mock = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(JSON.parse(body.input).resume, resume);
    assert.match(body.instructions, /Never invent/);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(expected) }] }] }) };
  };
  assert.deepEqual(await reviewWithAI({ resume, jobDescription: job, requirements: '' }, { apiKey: 'test-key', fetchImpl: mock }), expected);
  await assert.rejects(() => reviewWithAI({ resume, jobDescription: job }, { apiKey: '', fetchImpl: mock }), /not configured/);
  await assert.rejects(() => reviewWithAI({ resume, jobDescription: job }, { apiKey: 'test-key', fetchImpl: async () => ({ ok: false, status: 429 }) }), /usage limit/);
  await assert.rejects(() => reviewWithAI({ resume, jobDescription: job }, { apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] }) }) }), /invalid review/);
});

test('provider configuration selects only the intended key and preserves legacy OpenAI setup', () => {
  assert.deepEqual(getAIConfig({ OPENAI_API_KEY: 'legacy-key', OPENAI_MODEL: 'legacy-model' }), { provider: 'openai', label: 'OpenAI', apiKey: 'legacy-key', model: 'legacy-model' });
  assert.deepEqual(getAIConfig({ AI_PROVIDER: ' Gemini ', GEMINI_API_KEY: 'gemini-key', OPENAI_API_KEY: 'other-key', GEMINI_MODEL: 'gemini-model' }), { provider: 'gemini', label: 'Google Gemini', apiKey: 'gemini-key', model: 'gemini-model' });
  const generic = getAIConfig({ AI_PROVIDER: 'gemini', AI_API_KEY: ' generic-key ', GEMINI_API_KEY: 'other-key', AI_MODEL: 'generic-model', GEMINI_MODEL: 'other-model' });
  assert.equal(generic.apiKey, 'generic-key');
  assert.equal(generic.model, 'generic-model');
  assert.equal(getAIConfig({ AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'openai-only' }).apiKey, '');
  assert.equal(getAIConfig({ GEMINI_API_KEY: 'gemini-only' }).apiKey, '');
  assert.equal(getAIConfig({ AI_PROVIDER: 'gemini' }).model, 'gemini-3.8-flash');
  assert.equal(getAIConfig({ AI_PROVIDER: 'gemini', AI_MODEL: '3.5-flash-lite' }).model, 'gemini-3.5-flash-lite');
  assert.equal(getAIConfig({ AI_PROVIDER: 'gemini', GEMINI_MODEL: 'gemini-3.5-flash-lite' }).model, 'gemini-3.5-flash-lite');
  assert.throws(() => getAIConfig({ AI_PROVIDER: 'unknown' }), /AI_PROVIDER/);
});

test('Gemini uses its endpoint, bearer key, shared schema and resume instructions', async () => {
  const expected = { fitScore: 70, summary: 'React fits the role.', strengths: ['React'], gaps: ['TypeScript'], recommendations: ['Review gaps'], revisedResume: cleanResume(resume), changes: ['Headings'], cautions: ['Review facts'] };
  const mock = async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer gemini-test-key');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-custom');
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.match(body.messages[0].content, /Never invent/);
    assert.equal(JSON.parse(body.messages[1].content).resume, resume);
    assert.equal('store' in body, false);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(expected) } }] }) };
  };
  assert.deepEqual(await reviewWithAI({ resume, jobDescription: job }, { provider: 'gemini', apiKey: 'gemini-test-key', model: 'gemini-custom', fetchImpl: mock }), expected);
  for (const [data, message] of [
    [{ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(expected) } }] }, /did not finish/],
    [{ choices: [{ finish_reason: 'content_filter', message: {} }] }, /declined/],
    [{ choices: [{ finish_reason: 'stop', message: { refusal: 'blocked' } }] }, /declined/],
    [{ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }, /invalid review/],
    [{ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }, /invalid review/],
  ]) await assert.rejects(() => reviewWithAI({ resume, jobDescription: job }, { provider: 'gemini', apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => data }) }), message);
  for (const [status, message] of [[401, /credentials/], [429, /usage limit/], [400, /AI_MODEL/], [404, /AI_MODEL/], [500, /could not be completed/]]) {
    await assert.rejects(() => reviewWithAI({ resume, jobDescription: job }, { provider: 'gemini', apiKey: 'test', fetchImpl: async () => ({ ok: false, status }) }), message);
  }
  for (const [error, message] of [[new DOMException('timeout', 'TimeoutError'), /timed out after 90 seconds/], [new TypeError('fetch failed'), /Could not connect to Google Gemini/]]) {
    await assert.rejects(() => reviewWithAI({ resume, jobDescription: job }, { provider: 'gemini', apiKey: 'test', fetchImpl: async () => { throw error; } }), message);
  }
});

for (const provider of ['openai', 'gemini']) test(`${provider} API exposes safe configuration, binds consent, reviews and falls back locally`, async t => {
  const expected = { fitScore: 70, summary: 'React fits the role.', strengths: ['React'], gaps: ['TypeScript'], recommendations: [], revisedResume: cleanResume(resume), changes: ['Headings'], cautions: ['Review facts'] };
  let calls = 0;
  let fail = false;
  const fetchImpl = async url => {
    calls++;
    assert.ok(provider === 'gemini' ? url.startsWith('https://generativelanguage.googleapis.com/') : url.startsWith('https://api.openai.com/'));
    if (fail) return { ok: false, status: 500 };
    return { ok: true, json: async () => provider === 'gemini'
      ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(expected) } }] }
      : { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(expected) }] }] } };
  };
  const server = createApp({ env: { AI_PROVIDER: provider, AI_API_KEY: 'secret-test-key', AI_MODEL: 'test-model' }, fetchImpl }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.aiAvailable, true);
  assert.equal(config.aiProvider, provider);
  assert.equal(config.aiProviderLabel, provider === 'gemini' ? 'Google Gemini' : 'OpenAI');
  assert.equal(JSON.stringify(config).includes('secret-test-key'), false);
  assert.equal('apiKey' in config, false);
  const post = overrides => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume, jobDescription: job, useAI: true, aiConsent: true, aiProvider: provider, ...overrides }) });
  assert.equal((await post({ aiConsent: false })).status, 400);
  assert.equal((await post({ aiProvider: provider === 'gemini' ? 'openai' : 'gemini' })).status, 400);
  assert.equal((await post({ aiProvider: undefined })).status, 400);
  const local = await (await post({ useAI: false, aiConsent: false })).json();
  assert.equal(local.ai, null);
  assert.equal(calls, 0);
  const result = await (await post({})).json();
  assert.deepEqual(result.ai, expected);
  assert.equal(result.aiProvider, provider);
  assert.equal(result.aiProviderLabel, config.aiProviderLabel);
  assert.equal(result.revisedResume, expected.revisedResume);
  assert.equal(calls, 1);
  fail = true;
  const fallback = await (await post({})).json();
  assert.equal(fallback.ai, null);
  assert.match(fallback.aiError, /could not be completed/);
  assert.equal(fallback.revisedResume, cleanResume(resume));
  assert.equal(fallback.original.score, analyze(resume, job).score);
  assert.equal(calls, 2);
});

test('invalid AI configuration disables AI without breaking local analysis', async t => {
  const server = createApp({ env: { AI_PROVIDER: 'unknown', AI_API_KEY: 'secret' } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.aiAvailable, false);
  assert.match(config.aiConfigError, /AI_PROVIDER/);
  assert.equal(JSON.stringify(config).includes('secret'), false);
  const post = useAI => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume, jobDescription: job, useAI, aiConsent: true }) });
  assert.equal((await post(false)).status, 200);
  assert.equal((await post(true)).status, 503);
});

test('Vercel API works without a password, enforces proxy origins and limits AI attempts', async t => {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' };
  let calls = 0;
  const app = createApp({ env: { VERCEL: '1', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'mock-key' }, fetchImpl: async () => { calls++; return { ok: false, status: 500 }; } });
  const server = app.listen(0, '127.0.0.1');
  const unconfigured = vercelApp.listen(0, '127.0.0.1');
  await Promise.all([server, unconfigured].map(s => new Promise(resolve => s.once('listening', resolve))));
  t.after(() => Promise.all([server, unconfigured].map(s => new Promise(resolve => s.close(resolve)))));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`http://127.0.0.1:${unconfigured.address().port}/api/config`)).status, 200);
  const config = await fetch(`${base}/api/config`, { headers });
  assert.equal(config.status, 200);
  const text = await config.text();
  assert.equal(text.includes('mock-key'), false);
  const post = (useAI = true, origin = `https://127.0.0.1:${server.address().port}`) => fetch(`${base}/api/analyze`, { method: 'POST', headers: { ...headers, Origin: origin }, body: JSON.stringify({ resume, jobDescription: job, useAI, aiConsent: useAI, aiProvider: 'gemini' }) });
  assert.equal((await post(true, 'https://untrusted.example')).status, 403);
  assert.equal(calls, 0);
  for (let i = 0; i < 10; i++) {
    const result = await post();
    assert.equal(result.status, 200);
    assert.match((await result.json()).aiError, /could not be completed/);
  }
  assert.equal((await post()).status, 429);
  assert.equal(calls, 10);
  assert.equal((await post(false)).status, 200);
  assert.equal((await fetch(`${base}/api/extract`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'resume.txt' }, body: resume })).status, 200);
  assert.equal((await fetch(`${base}/api/export`, { method: 'POST', headers, body: JSON.stringify({ text: resume }) })).status, 200);
});

test('API completes upload, review and DOCX download, and rejects invalid requests', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const uploaded = await fetch(`${base}/api/extract`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'resume.txt' }, body: resume });
  assert.equal(uploaded.status, 200);
  assert.equal((await uploaded.json()).text, resume);
  const reviewed = await fetch(`${base}/api/analyze`, json({ resume, jobDescription: job, requirements: 'TypeScript' }));
  assert.equal(reviewed.status, 200);
  const data = await reviewed.json();
  assert.equal(data.ai, null);
  assert.equal(contains(data.revisedResume, 'TypeScript'), false);
  const exported = await fetch(`${base}/api/export`, json({ text: data.revisedResume }));
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type'), /wordprocessingml/);
  assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  assert.equal((await fetch(`${base}/api/analyze`, json({ resume, jobDescription: job, useAI: true }))).status, 400);
  assert.equal((await fetch(`${base}/api/analyze`, json({ resume: 'short', jobDescription: job }))).status, 400);
  assert.equal((await fetch(`${base}/api/analyze`, { ...json({ resume, jobDescription: job }), headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/export`, json({ text: '' }))).status, 400);
  assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
});
