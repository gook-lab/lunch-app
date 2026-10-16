/**
 * 계절 배경 입자 — 봄 꽃잎·여름 반딧불·가을 낙엽·겨울 눈송이.
 * 무엇을 그릴지는 html[data-season] 을 보고 CSS 가 정한다. 계절을 끄면 통째로 숨는다.
 * 바탕 뒤(z-index -1)에 깔려 카드·게임판을 가리지 않고, 누를 수도 없다.
 * 자리·속도는 번호로 정해 두어 다시 그려도 같은 그림이다.
 */
const COUNT = 30;

export function SeasonSky() {
  return (
    <div className="season-sky" aria-hidden="true">
      {Array.from({ length: COUNT }, (_, i) => (
        <span
          key={i}
          style={
            {
              '--x': `${(i * 37 + 11) % 100}%`,
              '--d': `${16 + ((i * 7) % 11)}s`,
              '--delay': `${-((i * 5.3) % 20)}s`,
              '--s': `${0.7 + ((i * 13) % 7) / 10}`,
              '--sway': `${(i % 2 ? 1 : -1) * (20 + ((i * 11) % 40))}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
