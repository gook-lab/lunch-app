// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sfx, sfxLater } from './sfx';

/** 만든 오실레이터 수만 세는 가짜 AudioContext. */
function fakeAudio() {
  const made = { osc: 0 };
  const param = () => ({
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    value: 0,
  });
  const node = () => ({
    connect: (n: unknown) => n,
    start() {},
    stop() {},
    gain: param(),
    frequency: param(),
    Q: param(),
    type: '',
    buffer: null,
  });
  class AC {
    currentTime = 0;
    state = 'running';
    sampleRate = 8000;
    destination = {};
    createOscillator() {
      made.osc += 1;
      return node();
    }
    createGain = node;
    createBiquadFilter = node;
    createBufferSource = node;
    createBuffer = () => ({ getChannelData: () => new Float32Array(10) });
    resume() {}
  }
  vi.stubGlobal('AudioContext', AC);
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('sfx', () => {
  it('소리를 끈 사람에겐 오디오를 만들지 않는다', () => {
    const made = fakeAudio();
    localStorage.setItem('lunch-app:sound', '0');
    sfx('beep');
    expect(made.osc).toBe(0);
  });

  it('켜면 울리고, 같은 소리를 몰아서 부르면 한 번만 낸다', () => {
    const made = fakeAudio();
    localStorage.setItem('lunch-app:sound', '1');
    sfx('go');
    sfx('go');
    expect(made.osc).toBe(1);
  });

  it('예약한 소리는 취소하면 울리지 않는다', () => {
    vi.useFakeTimers();
    const made = fakeAudio();
    localStorage.setItem('lunch-app:sound', '1');
    const cancel = sfxLater([[100, 'beep']]);
    cancel();
    vi.advanceTimersByTime(200);
    expect(made.osc).toBe(0);
  });
});
