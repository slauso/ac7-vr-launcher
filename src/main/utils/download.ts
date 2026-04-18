import fs from 'node:fs';
import https from 'node:https';

export const downloadFile = async (
  url: string,
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> => {
  await fs.promises.mkdir(require('node:path').dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'ac7-vr-launcher' } }, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, outputPath, onProgress).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const total = Number(response.headers['content-length'] ?? 0);
      let received = 0;

      const output = fs.createWriteStream(outputPath);
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total > 0) {
          onProgress(Math.min(100, Math.round((received / total) * 100)));
        }
      });
      response.on('error', reject);
      output.on('error', reject);
      output.on('close', () => {
        onProgress(100);
        resolve();
      });
      response.pipe(output);
    });

    request.on('error', reject);
  });
};
