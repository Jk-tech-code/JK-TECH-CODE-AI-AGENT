import sharp from 'sharp';

const PORT = parseInt(process.env.PORT || '7101');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/process' && req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';

      let inputBuffer: Buffer;
      let format: string | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let quality: number | undefined;

      if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('image');
        if (!file || !(file instanceof File)) {
          return Response.json({ error: 'Missing image field' }, { status: 400 });
        }
        inputBuffer = Buffer.from(await file.arrayBuffer());
        width = form.get('width') ? parseInt(form.get('width') as string) : undefined;
        height = form.get('height') ? parseInt(form.get('height') as string) : undefined;
        format = (form.get('format') as string) || undefined;
        quality = form.get('quality') ? parseInt(form.get('quality') as string) : undefined;
      } else {
        const body = await req.json();
        const base64 = body.image;
        if (!base64) {
          return Response.json({ error: 'Missing image field' }, { status: 400 });
        }
        inputBuffer = Buffer.from(base64, 'base64');
        width = body.width;
        height = body.height;
        format = body.format;
        quality = body.quality;
      }

      if (inputBuffer.length > MAX_FILE_SIZE) {
        return Response.json({ error: 'File too large (max 50MB)' }, { status: 413 });
      }

      try {
        let pipeline = sharp(inputBuffer);

        const metadata = await pipeline.metadata();

        if (width || height) {
          pipeline = pipeline.resize(width, height, { fit: 'inside', withoutEnlargement: true });
        }

        const outputFormat = format || metadata.format || 'jpeg';
        const outputQuality = quality || 85;

        switch (outputFormat) {
          case 'jpeg':
          case 'jpg':
            pipeline = pipeline.jpeg({ quality: outputQuality });
            break;
          case 'png':
            pipeline = pipeline.png({ compressionLevel: 9 - Math.floor(outputQuality / 11) });
            break;
          case 'webp':
            pipeline = pipeline.webp({ quality: outputQuality });
            break;
          case 'avif':
            pipeline = pipeline.avif({ quality: outputQuality });
            break;
          default:
            pipeline = pipeline.jpeg({ quality: outputQuality });
        }

        const output = await pipeline.toBuffer();
        const outMetadata = await sharp(output).metadata();

        return new Response(output, {
          headers: {
            'content-type': `image/${outputFormat}`,
            'x-original-width': String(metadata.width || 0),
            'x-original-height': String(metadata.height || 0),
            'x-output-width': String(outMetadata.width || 0),
            'x-output-height': String(outMetadata.height || 0),
            'x-output-size': String(output.length),
          },
        });
      } catch (err) {
        return Response.json({ error: 'Image processing failed', detail: String(err) }, { status: 400 });
      }
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'image-processor' });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`[image-processor] listening on :${PORT}`);
