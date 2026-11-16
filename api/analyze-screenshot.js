// Serverless function (Vercel auto-detects anything onder api/) die de Anthropic API met de
// server-side ANTHROPIC_API_KEY-omgevingsvariabele aanroept — de key is hier nooit zichtbaar voor de
// browser, in tegenstelling tot een rechtstreekse client-side aanroep. Zie de "Upload screenshot"-
// feature in TeamScreenshotUpload.jsx: dit endpoint herkent spelers op een FPL-teamscreenshot en geeft
// enkel een VOORSTEL terug — nooit een definitieve/stille wijziging, dat gebeurt pas client-side na
// expliciete bevestiging door de gebruiker.
//
// Response-contract: succes/gedeeltelijk succes -> altijd HTTP 200 met { players, warning }. warning is
// null of { code, count? } zodra niet alle spelers herkend zijn (nooit een stil onvolledig "succes").
// Een echte fout -> HTTP 4xx/5xx met { code }. Er staan bewust geen zinnen in de antwoorden: de site
// bestaat in drie talen, dus TeamScreenshotUpload.jsx vertaalt de codes (FUNCTIONALITEIT_SPEC A3).
// Codes: method_not_allowed, forbidden_origin, not_configured, no_image, image_too_large,
// service_unreachable, service_error, rate_limited; warnings: not_recognized, partial (+ count).
//
// Beveiliging (spec A5): dit endpoint gebruikt de API-sleutel van de eigenaar en kost dus geld per
// oproep. Daarom enkel verzoeken vanaf de eigen site (productie of een Vercel-preview van dit
// project) en geen afbeeldingen boven ~4 MB. Let op: een Origin-header kan buiten een browser
// vervalst worden, dus dit houdt enkel misbruik vanaf andere websites tegen. De echte rem is de
// rate limit in Vercel → Firewall en een maandlimiet op de sleutel in de Anthropic Console (werk
// voor de eigenaar, zie de PR van fase A).

const ALLOWED_HOSTS = new Set(['fplproleague.vercel.app']);
// Previews van dit Vercel-project: fdr-jpl-tool-git-<branch>-fpl-proleague.vercel.app of
// fdr-jpl-tool-<id>-fpl-proleague.vercel.app.
const PREVIEW_HOST = /^fdr-jpl-tool-[a-z0-9-]+-fpl-proleague\.vercel\.app$/;
const MAX_BASE64_LENGTH = 4 * 1024 * 1024;

function hostFromHeader(value) {
  if (!value || typeof value !== 'string') return null;
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

export function isAllowedOrigin(headers, env = process.env) {
  const host = hostFromHeader(headers?.origin) ?? hostFromHeader(headers?.referer);
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host) || PREVIEW_HOST.test(host)) return true;
  // Lokaal testen (npx vercel dev) mag, maar nooit op productie.
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal && env.VERCEL_ENV !== 'production';
}

const PLAYERS_SCHEMA = {
  type: 'object',
  properties: {
    players: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          position: { type: 'string', enum: ['GK', 'DEF', 'MID', 'FWD'] },
          rowLabel: { type: 'string' },
          isCaptain: { type: 'boolean' },
          isViceCaptain: { type: 'boolean' },
        },
        required: ['name', 'position', 'rowLabel', 'isCaptain', 'isViceCaptain'],
        additionalProperties: false,
      },
    },
    // Budget en gratis transfers staan vaak op dezelfde screenshot (spec C8). null = niet zichtbaar.
    // Verplicht in het schema maar nullable: zo antwoordt het model altijd expliciet.
    bank: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    freeTransfers: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
  },
  required: ['players', 'bank', 'freeTransfers'],
  additionalProperties: false,
};

// Budget (€M, 0–100, op 0,1 afgerond) en gratis transfers (0–3, het plafond van het spel) uit het
// antwoord van het model. Alles wat daar niet in past, wordt null: de bezoeker vult het dan zelf in.
export function readSquadExtras(parsed) {
  const bank = Number(parsed?.bank);
  const free = Number(parsed?.freeTransfers);
  return {
    bank: parsed?.bank !== null && Number.isFinite(bank) && bank >= 0 && bank <= 100 ? Math.round(bank * 10) / 10 : null,
    freeTransfers: parsed?.freeTransfers !== null && Number.isInteger(free) && free >= 0 ? Math.min(3, free) : null,
  };
}

const PROMPT_TEXT = `Dit is een screenshot van de "Transfers"-pagina van een Fantasy Premier League-achtige app voor de Belgische Jupiler Pro League. Spelers staan in rijen gegroepeerd per positie (doelmannen, verdedigers, middenvelders, aanvallers — mogelijk met een aparte bankrij onderaan). Elke speler heeft een foto, een apart, egaal gekleurd tekstlabel met de achternaam eronder (bv. "ROEF"), en een prijs (bv. "€7M"). Eén speler kan een "C"-badge (kapitein) hebben, één een "V"-badge (vice-kapitein).

Je hoeft deze mensen niet te identificeren — lees enkel de reeds afgedrukte tekst in het label onder elke foto.

Herken ELKE speler die zichtbaar is. Geef voor elk:
- name: de letterlijke tekst van het naamlabel.
- position: je beste inschatting van de voetbalpositie (GK/DEF/MID/FWD) op basis van visuele context zoals rij-groepering en shirtstijl — niet enkel de rij-index, want de indeling kan per screenshot-bron verschillen.
- rowLabel: een vrije, korte beschrijving van de rij/sectie waarin je deze speler visueel waarnam (bv. "GK", "Bank", of gewoon de rij-positie van boven naar onder).
- isCaptain / isViceCaptain: of deze speler de C- resp. V-badge draagt.

Lees daarnaast, als ze zichtbaar zijn:
- bank: het resterende budget in miljoen euro (bv. "€2.5M" of "Budget 2,5" → 2.5). Niet zichtbaar = null.
- freeTransfers: het aantal gratis transfers (bv. "1 Free Transfer" of "2 gratis transfers" → 1 of 2). Niet zichtbaar = null.
Verzin deze twee getallen nooit: twijfel je, geef dan null.

Als een naam onduidelijk, afgesneden of onleesbaar is, geef toch je beste gok — de gebruiker corrigeert dit zelf nadien. Sla geen enkele zichtbare speler over.`;

// Iets ruimer dan MAX_BASE64_LENGTH, zodat een te grote afbeelding de nette code image_too_large krijgt.
export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'method_not_allowed' });
  }

  if (!isAllowedOrigin(req.headers)) {
    return res.status(403).json({ code: 'forbidden_origin' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ code: 'not_configured' });
  }

  const { imageBase64, mediaType } = req.body ?? {};
  const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!imageBase64 || typeof imageBase64 !== 'string' || !allowedMediaTypes.includes(mediaType)) {
    return res.status(400).json({ code: 'no_image' });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ code: 'image_too_large' });
  }

  let anthropicResponse;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        output_config: { format: { type: 'json_schema', schema: PLAYERS_SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: PROMPT_TEXT },
          ],
        }],
      }),
    });
  } catch {
    return res.status(502).json({ code: 'service_unreachable' });
  }

  if (!anthropicResponse.ok) {
    const status = anthropicResponse.status === 429 ? 429 : 502;
    return res.status(status).json({ code: status === 429 ? 'rate_limited' : 'service_error' });
  }

  const data = await anthropicResponse.json().catch(() => null);
  if (!data || data.stop_reason === 'refusal') {
    return res.status(200).json({ players: [], warning: { code: 'not_recognized' } });
  }

  const textBlock = Array.isArray(data.content) ? data.content.find(b => b.type === 'text') : null;
  let parsed = null;
  try {
    parsed = textBlock ? JSON.parse(textBlock.text) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.players)) {
    return res.status(200).json({ players: [], warning: { code: 'not_recognized' } });
  }

  const players = parsed.players
    .filter(p => p && typeof p.name === 'string' && p.name.trim())
    .map(p => ({
      name: p.name.trim(),
      position: ['GK', 'DEF', 'MID', 'FWD'].includes(p.position) ? p.position : null,
      rowLabel: typeof p.rowLabel === 'string' ? p.rowLabel : '',
      isCaptain: p.isCaptain === true,
      isViceCaptain: p.isViceCaptain === true,
    }));

  const warning = players.length === 0
    ? { code: 'not_recognized' }
    : players.length < 15
      ? { code: 'partial', count: players.length }
      : null;

  return res.status(200).json({ players, warning, ...readSquadExtras(parsed) });
}
