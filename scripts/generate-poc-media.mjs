import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Docker command failed');
  return result.stdout.trim();
}
const destination = resolve('apps/web/public/poc-media');
mkdirSync(destination, { recursive: true });
const temporary = '/tmp/carrot-t01-fixtures';
docker('compose', 'exec', '-T', 'worker', 'mkdir', '-p', temporary);
const container = docker('compose', 'ps', '-q', 'worker');
if (!/^[a-f0-9]+$/.test(container)) throw new Error('Expected one running worker');
for (let sample = 1; sample <= 5; sample++) {
  const path = `${temporary}/sample-${sample}`;
  docker(
    'compose',
    'exec',
    '-T',
    'worker',
    'ffmpeg',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=24',
    '-t',
    '3',
    '-vf',
    `hue=h=${(sample - 1) * 55}`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    `${path}.mp4`,
  );
  docker(
    'compose',
    'exec',
    '-T',
    'worker',
    'ffmpeg',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    '1',
    '-i',
    `${path}.mp4`,
    '-frames:v',
    '1',
    '-update',
    '1',
    '-vf',
    'scale=432:243',
    `${path}.jpg`,
  );
  for (const extension of ['mp4', 'jpg'])
    docker(
      'cp',
      `${container}:${path}.${extension}`,
      `${destination}/sample-${sample}.${extension}`,
    );
  console.log(`Generated sample ${sample}: 1280×720, 24 fps, 3 seconds, H.264 MP4.`);
}
