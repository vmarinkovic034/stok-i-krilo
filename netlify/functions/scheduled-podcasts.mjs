// Automatska obrada podkasta - ponedeljkom u 04:00 UTC, pre dnevnih vesti.
import { generisiIzPodkasta } from './_podkast-generator.mjs';

export default async () => {
  const r = await generisiIzPodkasta({ maks: 3 });
  console.log('scheduled-podcasts:', await r.clone().text());
  return r;
};

export const config = { schedule: '0 4 * * 1' };
