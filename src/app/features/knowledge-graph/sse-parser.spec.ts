import { readSseStream } from './sse-parser';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const frames: { event: string; data: string }[] = [];
  for await (const f of readSseStream(stream)) frames.push(f);
  return frames;
}

describe('readSseStream', () => {
  it('parses a single named event', async () => {
    const stream = streamFromChunks(['event: path\ndata: {"length":1}\n\n']);
    const frames = await collect(stream);
    expect(frames).toEqual([{ event: 'path', data: '{"length":1}' }]);
  });

  it('parses multiple events in a single chunk', async () => {
    const stream = streamFromChunks([
      'event: path\ndata: {"length":1}\n\nevent: path\ndata: {"length":2}\n\nevent: done\ndata: {"total":2}\n\n',
    ]);
    const frames = await collect(stream);
    expect(frames.length).toBe(3);
    expect(frames[0].event).toBe('path');
    expect(frames[2].event).toBe('done');
  });

  it('reassembles events split across chunks', async () => {
    const stream = streamFromChunks(['event: path\nda', 'ta: {"length":', '3}\n\n']);
    const frames = await collect(stream);
    expect(frames).toEqual([{ event: 'path', data: '{"length":3}' }]);
  });

  it('concatenates multi-line data payloads', async () => {
    const stream = streamFromChunks(['event: message\ndata: line1\ndata: line2\n\n']);
    const frames = await collect(stream);
    expect(frames[0].data).toBe('line1\nline2');
  });

  it('ignores comment lines', async () => {
    const stream = streamFromChunks([': heartbeat\nevent: ping\ndata: ok\n\n']);
    const frames = await collect(stream);
    expect(frames).toEqual([{ event: 'ping', data: 'ok' }]);
  });
});
