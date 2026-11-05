/**
 * Âm thanh nhẹ tổng hợp bằng Web Audio API: không tải file, không thêm thư viện.
 * Trình duyệt chỉ cho phát sau khi người dùng chạm, nên các âm luôn gắn với một lần chạm.
 */
export type SoundName = "tap" | "star" | "success" | "fanfare" | "cheer";

const MUTE_KEY = "scribekids-muted";

let ctx: AudioContext | null = null;

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Không lưu được thì chỉ có tác dụng tới khi tải lại trang.
  }
}

function tone(c: AudioContext, freq: number, at: number, length: number, volume: number, type: OscillatorType) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Lên và xuống âm lượng mềm để không có tiếng "bụp" và không chói tai trẻ nhỏ.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

const NOTES: Record<SoundName, [freq: number, delay: number, length: number][]> = {
  tap: [[660, 0, 0.07]],
  star: [[880, 0, 0.12], [1320, 0.07, 0.2]],
  success: [[523, 0, 0.14], [784, 0.11, 0.26]],
  cheer: [[392, 0, 0.18], [523, 0.15, 0.3]],
  fanfare: [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.45]],
};

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.01;
    const volume = name === "tap" ? 0.04 : 0.1;
    for (const [freq, delay, length] of NOTES[name]) {
      tone(ctx, freq, start + delay, length, volume, "sine");
    }
  } catch {
    // Âm thanh chỉ là phần thêm: lỗi không được làm hỏng thao tác của bé.
  }
}
