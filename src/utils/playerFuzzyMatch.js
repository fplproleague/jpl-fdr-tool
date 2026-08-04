// Matcht een door de "Upload screenshot"-herkenning teruggegeven spelernaam (meestal enkel de
// achternaam, zoals op een FPL-screenshot getoond) tegen de spelersdatabank. Genormaliseerde
// Levenshtein-similarity, gescoord tegen zowel de volledige databank-naam als het laatste woord
// ervan (de vermoedelijke achternaam) — het beste van de twee wint, want de databank kan zowel
// volledige namen als enkel-achternamen bevatten.

function normalize(str) {
  return str
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accenten strippen (bv. É -> E)
    .replace(/[^A-Z ]/g, '')
    .trim();
}

// Klassieke iteratieve Levenshtein-afstand — korte strings (achternamen), geen library nodig.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Similarity in [0, 1]: 1 = identiek, 0 = volledig verschillend.
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function bestNameSimilarity(recognizedName, dbFullName) {
  const recognized = normalize(recognizedName);
  const dbNormalized = normalize(dbFullName);
  const dbTokens = dbNormalized.split(' ').filter(Boolean);
  const dbSurname = dbTokens[dbTokens.length - 1] ?? dbNormalized;
  return Math.max(
    similarity(recognized, dbNormalized),
    similarity(recognized, dbSurname),
  );
}

const HIGH_THRESHOLD = 0.85;
const LOW_THRESHOLD = 0.6;

// recognized: { name, position } — position mag null zijn als het model geen gok waagde.
// Retourneert { matched, confidence, score }. `matched` (of null) is het dichtstbijzijnde
// databank-record; de databank-positie daarvan blijft altijd autoritatief voor wat uiteindelijk
// weggeschreven wordt. `confidence` is enkel een UI-signaal.
export function matchPlayer(recognized, playerDatabase) {
  let best = null;
  let bestScore = -1;
  for (const candidate of playerDatabase) {
    const score = bestNameSimilarity(recognized.name, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best || bestScore < LOW_THRESHOLD) {
    return { matched: null, confidence: 'niet-gevonden', score: bestScore };
  }

  const positionAgrees = !recognized.position || recognized.position === best.position;
  if (bestScore >= HIGH_THRESHOLD && positionAgrees) {
    return { matched: best, confidence: 'hoog', score: bestScore };
  }
  // Hoge naam-gelijkenis maar de herkende positie wijkt af van de databank -> verlaagd naar
  // 'twijfelachtig' i.p.v. 'hoog', zodat de gebruiker dit extra checkt vóór het toepassen.
  return { matched: best, confidence: 'twijfelachtig', score: bestScore };
}
