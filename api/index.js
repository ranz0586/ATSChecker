import { createApp } from '../server/index.js';

export default createApp({ env: { ...process.env, VERCEL: '1' } });
