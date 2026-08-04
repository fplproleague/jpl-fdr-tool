// Schaalt een geüploade afbeelding client-side terug naar maximaal 2576px lange zijde — dat is
// Claude's "high-resolution"-tier-limiet voor recente modellen (zie api/analyze-screenshot.js), dus
// groter versturen heeft geen zin (wordt daar toch herschaald) en kleiner riskeert onleesbare
// naamlabels op de screenshot. Gebruikt enkel standaard browser-API's (URL.createObjectURL + <img> +
// <canvas>), geen library nodig.
export function downscaleImageToBase64(file, maxDimension = 2576) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      // Kwaliteit 0.92 i.p.v. een agressievere waarde: zware JPEG-compressie maakt tekst
      // (de naamlabels) net minder leesbaar, en leesbaarheid is hier het hele punt.
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kon de afbeelding niet lezen.'));
    };
    img.src = url;
  });
}
