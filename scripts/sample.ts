import { buildSample } from '../server/simulation.js';
const sample = await buildSample();
console.log(`Saved ${sample.turns.length} adjudicated phases: ${sample.id}`);
