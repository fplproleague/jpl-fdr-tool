// Serverless function (Vercel auto-detects anything onder api/) die de Anthropic API met de
// server-side ANTHROPIC_API_KEY-omgevingsvariabele aanroept — de key is hier nooit zichtbaar voor de
// browser, in tegenstelling tot een rechtstreekse client-side aanroep. Zie de "Upload screenshot"-
// feature in TeamScreenshotUpload.jsx: dit endpoint herkent spelers op een FPL-teamscreenshot en geeft
// enkel een VOORSTEL terug — nooit een definitieve/stille wijziging, dat gebeurt pas client-side na
// expliciete bevestiging door de gebruiker.
//
// Response-contract: succes/gedeeltelijk succes -> altijd HTTP 200 met { players, warning }, warning
// is gezet zodra niet alle spelers herkend zijn (nooit een stil onvolledig "succes"). Een echte
// infrastructuurfout (ontbrekende key, Anthropic-fout, netwerkfout, onparseerbaar antwoord) -> HTTP
// 4xx/5xx met { error }, zodat de client dit kan onderscheiden van "model kon de foto niet goed lezen".

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
  },
  required: ['players'],
  additionalProperties: false,
};

const PROMPT_TEXT = `Dit is een screenshot van de "Transfers"-pagina van een Fantasy Premier League-achtige app voor de Belgische Jupiler Pro League. Spelers staan in rijen gegroepeerd per positie (doelmannen, verdedigers, middenvelders, aanvallers — mogelijk met een aparte bankrij onderaan). Elke speler heeft een foto, een apart, egaal gekleurd tekstlabel met de achternaam eronder (bv. "ROEF"), en een prijs (bv. "€7M"). Eén speler kan een "C"-badge (kapitein) hebben, één een "V"-badge (vice-kapitein).

Je hoeft deze mensen niet te identificeren — lees enkel de reeds afgedrukte tekst in het label onder elke foto.

Herken ELKE speler die zichtbaar is. Geef voor elk:
- name: de letterlijke tekst van het naamlabel.
- position: je beste inschatting van de voetbalpositie (GK/DEF/MID/FWD) op basis van visuele context zoals rij-groepering en shirtstijl — niet enkel de rij-index, want de indeling kan per screenshot-bron verschillen.
- rowLabel: een vrije, korte beschrijving van de rij/sectie waarin je deze speler visueel waarnam (bv. "GK", "Bank", of gewoon de rij-positie van boven naar onder).
- isCaptain / isViceCaptain: of deze speler de C- resp. V-badge draagt.

Als een naam onduidelijk, afgesneden of onleesbaar is, geef toch je beste gok — de gebruiker corrigeert dit zelf nadien. Sla geen enkele zichtbare speler over.`;

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server niet correct geconfigureerd (ontbrekende API-key).' });
  }

  const { imageBase64, mediaType } = req.body ?? {};
  const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!imageBase64 || typeof imageBase64 !== 'string' || !allowedMediaTypes.includes(mediaType)) {
    return res.status(400).json({ error: 'Geen geldige afbeelding ontvangen.' });
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
    return res.status(502).json({ error: 'Kon geen verbinding maken met de analyse-service.' });
  }

  if (!anthropicResponse.ok) {
    const status = anthropicResponse.status === 429 ? 429 : 502;
    return res.status(status).json({ error: 'Analyse-service gaf een fout terug, probeer later opnieuw.' });
  }

  const data = await anthropicResponse.json().catch(() => null);
  if (!data || data.stop_reason === 'refusal') {
    return res.status(200).json({ players: [], warning: 'Kon het team niet herkennen op deze screenshot. Vul je team handmatig in.' });
  }

  const textBlock = Array.isArray(data.content) ? data.content.find(b => b.type === 'text') : null;
  let parsed = null;
  try {
    parsed = textBlock ? JSON.parse(textBlock.text) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.players)) {
    return res.status(200).json({ players: [], warning: 'Kon het team niet herkennen op deze screenshot. Vul je team handmatig in.' });
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
    ? 'Geen spelers herkend op deze screenshot. Vul je team handmatig in.'
    : players.length < 15
      ? `Slechts ${players.length} van de 15 spelers herkend — vul de rest handmatig aan.`
      : null;

  return res.status(200).json({ players, warning });
}
