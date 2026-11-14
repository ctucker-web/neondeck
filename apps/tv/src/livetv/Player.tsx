// Plays one channel. HLS through hls.js, raw MPEG-TS through mpegts.js,
// everything else through the browser's own player.
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { streamKind } from '@neondeck/core';

interface Props {
  url: string;
  /** Called with the time from tune to first frame, in milliseconds. */
  onPlaying: (ms: number) => void;
  onError: (message: string) => void;
}

export function Player({ url, onPlaying, onError }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onPlaying, onError });
  cb.current = { onPlaying, onError };

  useEffect(() => {
    const video = ref.current!;
    const started = performance.now();
    let reported = false;
    let cleanup = () => {};

    const playing = () => {
      if (reported) return;
      reported = true;
      cb.current.onPlaying(Math.round(performance.now() - started));
    };
    const fail = (message: string) => {
      if (!reported) cb.current.onError(message);
    };
    video.addEventListener('playing', playing);
    const play = () => void video.play().catch(() => {});
    const kind = streamKind(url);

    if (kind === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        // Tuned for fast channel changes: skip the bandwidth probe, assume a
        // decent connection, and keep the buffer short.
        testBandwidth: false,
        abrEwmaDefaultEstimate: 4_000_000,
        startFragPrefetch: true,
        maxBufferLength: 12,
        manifestLoadingTimeOut: 10_000,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 10_000,
        fragLoadingTimeOut: 15_000,
      });
      let mediaRecoveries = 0;
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) {
          hls.recoverMediaError();
          return;
        }
        const status = data.response?.code ? ` (server answered ${data.response.code})` : '';
        fail(data.type === Hls.ErrorTypes.NETWORK_ERROR ? `This stream could not be reached${status}.` : `This stream could not be played (${data.details}).`);
        hls.destroy();
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      cleanup = () => hls.destroy();
    } else if (kind === 'mpegts' && mpegts.isSupported()) {
      const player = mpegts.createPlayer({ type: 'mpegts', isLive: true, url }, { enableStashBuffer: false, liveBufferLatencyChasing: true });
      player.on(mpegts.Events.ERROR, (_type: string, detail: string) => fail(`This stream could not be played (${detail}).`));
      player.attachMediaElement(video);
      player.load();
      play();
      cleanup = () => player.destroy();
    } else {
      const onErr = () => fail('This stream could not be played.');
      video.addEventListener('error', onErr);
      video.src = url;
      play();
      cleanup = () => {
        video.removeEventListener('error', onErr);
        video.removeAttribute('src');
        video.load();
      };
    }

    return () => {
      video.removeEventListener('playing', playing);
      cleanup();
    };
  }, [url]);

  return <video ref={ref} className="player__video" playsInline />;
}
