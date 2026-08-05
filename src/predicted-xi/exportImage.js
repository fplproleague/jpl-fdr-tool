// PNG-export voor de Predicted XI Builder — aangepast van handleDownloadImage (src/FDRTool.jsx),
// zelfde html2canvas-techniek en watermerk-truc. De scroll-width-forceer-stap uit het origineel is
// weggelaten: die was specifiek nodig voor FDR's horizontaal scrollbare tabel, terwijl het veldkaartje
// hier een vaste aspect-ratio heeft en nooit intern scrolt.
import html2canvas from 'html2canvas';
import { EXPORT_BACKGROUND, WATERMARK_TEXT, WATERMARK_FONT, WATERMARK_COLOR } from './theme';

export async function exportLineupAsPng(pitchEl, { clubCode, opponentCode, formationKey }) {
  if (!pitchEl) return;

  // Zelfde goedkope wachttijd als het origineel — vangt een nog-ladend clublogo of een nog niet
  // volledig ingeladen Google Font op vóór de capture.
  await new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 120);
      });
    });
  });

  const canvas = await html2canvas(pitchEl, { backgroundColor: EXPORT_BACKGROUND, scale: 2 });

  const watermarkHeight = 44 * 2;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = canvas.width;
  finalCanvas.height = canvas.height + watermarkHeight;
  const ctx = finalCanvas.getContext('2d');
  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.font = WATERMARK_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(WATERMARK_TEXT, finalCanvas.width / 2, canvas.height + watermarkHeight / 2);

  const date = new Date().toISOString().slice(0, 10);
  const opponentSuffix = opponentCode ? `-vs-${opponentCode.toLowerCase()}` : '';
  const link = document.createElement('a');
  link.download = `predicted-xi-${clubCode.toLowerCase()}${opponentSuffix}-${formationKey}-${date}.png`;
  link.href = finalCanvas.toDataURL('image/png');
  link.click();
}
