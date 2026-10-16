/**
 * 팟 알림을 브라우저 알림으로도 — 다른 창을 보고 있을 때만. 표시 전용(공정성 무관).
 *
 * 화면 안 알림(Parties)은 앱을 보고 있어야 눈에 띈다. 점심 직전엔 대개 다른 일을 하고 있어,
 * "곧 출발" 을 못 보고 놓친다. 탭이 가려져 있을 때만 시스템 알림을 한 번 띄운다.
 * 허락은 팟에 들어가거나 팟을 열 때 한 번만 묻는다(누른 그 순간이어야 브라우저가 창을 띄운다).
 */
const ASKED_KEY = 'lunch-app:notify-asked';

export function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 클릭 처리 안에서 동기로 부른다. 이미 정했거나 한 번 물었으면 다시 묻지 않는다. */
export function askNotifyOnce(): void {
  if (!canNotify() || Notification.permission !== 'default') return;
  try {
    if (window.localStorage.getItem(ASKED_KEY) === '1') return;
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch {
    return; // 기억 못 하면 매번 물을 수 있어 아예 묻지 않는다.
  }
  void Notification.requestPermission().catch(() => {});
}

/** 탭이 가려져 있고 허락돼 있으면 알림. 같은 tag 는 브라우저가 하나로 합친다. */
export function notifyIfHidden(items: { tag: string; text: string }[]): void {
  if (!canNotify() || Notification.permission !== 'granted' || document.visibilityState !== 'hidden') return;
  for (const { tag, text } of items) {
    try {
      const n = new Notification('오늘 점심', { body: text, tag, icon: '/favicon.svg' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // 안드로이드 크롬은 서비스 워커 없이 new Notification 을 막는다. 화면 안 알림으로 충분하다.
    }
  }
}
