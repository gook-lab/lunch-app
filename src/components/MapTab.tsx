/**
 * 지도 탭 — 우리 도보권을 눈으로 본다 (T10).
 *
 * 이 파일은 App 에서 lazy 로 불린다. 결정 화면 첫 페인트에 지도 코드가
 * 섞이지 않아야 하고(D7), SDK 는 여기 들어올 때 처음 요청된다.
 *
 * 지도 위에 검색바를 두지 않는다. 가게 추가는 목록 탭의 시트가 맡는다 —
 * 지도에서 찾아 바로 넣게 하면 도보권 밖 가게가 섞여 들어온다.
 *
 * 실패는 이 탭에서 끝난다. 여기서 던지면 돌림판까지 같이 죽으므로
 * 좌표 오류까지 전부 잡아서 화면 상태로 바꾼다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import { officeCoord } from '../lib/walk';
import {
  clearKakaoLoadFailure,
  KakaoLoadError,
  kakaoJsKey,
  loadKakaoMaps,
} from '../services/kakao';

interface Props {
  places: Place[];
}

type Phase = 'loading' | 'ready' | 'error';

interface Trouble {
  title: string;
  detail: string;
  retryable: boolean;
}

function troubleOf(error: unknown): Trouble {
  if (error instanceof KakaoLoadError) {
    if (error.kind === 'no-key') {
      return {
        title: '카카오 JS 키가 없습니다',
        detail:
          '.env.local 의 VITE_KAKAO_JS_KEY 를 채우고 개발 서버를 다시 띄워 주세요. 지도만 막히고 돌림판은 그대로 돕니다.',
        retryable: false,
      };
    }
    return {
      title: '지도 SDK 를 받지 못했습니다',
      detail:
        '가장 흔한 원인은 도메인 미등록입니다. 카카오 개발자 콘솔 > 앱 > 플랫폼 > Web 사이트 도메인에 ' +
        `${window.location.origin} 이 있는지 확인해 주세요.`,
      retryable: true,
    };
  }
  return {
    title: '지도를 그리지 못했습니다',
    detail: String((error as Error)?.message ?? error),
    retryable: true,
  };
}

export default function MapTab({ places }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => places.filter((p) => p.active), [places]);

  const retry = useCallback(() => {
    // 기억한 실패를 여기서만 지운다. 탭 진입은 요청을 다시 내지 않는다.
    clearKakaoLoadFailure();
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const teardown: (() => void)[] = [];

    setPhase('loading');
    setTrouble(null);

    loadKakaoMaps()
      .then((maps) => {
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;

        const office = officeCoord();

        // StrictMode 는 이펙트를 두 번 돌린다. 지우지 않으면 지도가 두 장 쌓인다.
        el.innerHTML = '';

        const center = new maps.LatLng(office.lat, office.lng);
        const map = new maps.Map(el, { center, level: 4 });

        const officeBadge = new maps.CustomOverlay({
          position: center,
          content: '<div class="map__office">회사</div>',
          map,
          yAnchor: 0.5,
          zIndex: 3,
        });
        teardown.push(() => officeBadge.setMap(null));

        const bounds = new maps.LatLngBounds();
        bounds.extend(center);

        for (const place of shown) {
          const position = new maps.LatLng(place.lat, place.lng);
          bounds.extend(position);

          const marker = new maps.Marker({ position, title: place.name, map });
          maps.event.addListener(marker, 'click', () => setSelected(place));
          teardown.push(() => marker.setMap(null));

          // 도보시간을 핀 아래에 붙인다. 눌러야 보이면 "도보권" 이 안 읽힌다.
          const pill = new maps.CustomOverlay({
            position,
            content: `<div class="map__pill">${place.walkMin}분</div>`,
            map,
            yAnchor: -0.4,
            zIndex: 2,
          });
          teardown.push(() => pill.setMap(null));
        }

        if (shown.length > 0) map.setBounds(bounds, 48, 32, 48, 32);
        setPhase('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setTrouble(troubleOf(error));
        setPhase('error');
      });

    return () => {
      cancelled = true;
      for (const off of teardown) off();
    };
  }, [shown, attempt]);

  if (phase === 'error' && trouble) {
    return (
      <section className="map map--trouble">
        <p className="notice notice--empty">{trouble.title}</p>
        <p className="muted small">{trouble.detail}</p>
        {trouble.retryable && (
          <Button variant="secondary" onClick={retry}>
            다시 시도
          </Button>
        )}
        {!kakaoJsKey() && (
          <p className="muted small">
            키가 없어도 돌림판·목록은 정상입니다. 지도만 나중에 붙이면 됩니다.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="map">
      <div className="map__canvas" ref={containerRef} aria-label="우리 도보권 지도" />
      {phase === 'loading' && <p className="muted small">지도를 불러오는 중입니다</p>}
      {phase === 'ready' && (
        <>
          {selected ? (
            <div className="map__info">
              <div>
                <strong>{selected.name}</strong>
                <p className="muted small">
                  {selected.category} · 도보 {selected.walkMin}분
                </p>
              </div>
              <button type="button" className="linkish" onClick={() => setSelected(null)}>
                닫기
              </button>
            </div>
          ) : (
            <p className="muted small">
              핀을 누르면 가게 정보가 보입니다 · 숫자는 회사에서 걸어가는 시간입니다
            </p>
          )}
          {shown.length === 0 && (
            <p className="notice notice--empty">아직 켜진 가게가 없어 핀이 없습니다.</p>
          )}
        </>
      )}
    </section>
  );
}
