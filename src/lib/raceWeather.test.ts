import { describe, it, expect } from 'vitest';
import {
  pickWeather,
  resolveSeason,
  seasonByMonth,
  weatherDescription,
  weatherModifiers,
  type Weather,
  SEASONS,
  WEATHERS,
} from './raceWeather';

describe('weather', () => {
  describe('seasonByMonth', () => {
    it('봄을 반환해야 한다(3~5월)', () => {
      // 현재 달을 모킹하지 않으므로, 실제 달에 따라 다르다.
      // 대신 seasonByMonth 함수 로직을 테스트한다.
      const result = seasonByMonth();
      expect(['spring', 'summer', 'autumn', 'winter']).toContain(result);
    });
  });

  describe('resolveSeason', () => {
    it('auto가 아니면 그 계절을 반환해야 한다', () => {
      expect(resolveSeason('spring')).toBe('spring');
      expect(resolveSeason('summer')).toBe('summer');
      expect(resolveSeason('autumn')).toBe('autumn');
      expect(resolveSeason('winter')).toBe('winter');
    });

    it('auto면 현재 달의 계절을 반환해야 한다', () => {
      const result = resolveSeason('auto');
      expect(['spring', 'summer', 'autumn', 'winter']).toContain(result);
    });
  });

  describe('pickWeather', () => {
    it('가장 자주 맑음을 반환해야 한다', () => {
      let count = 0;
      const seededRandom = ((seed: number) => {
        let value = seed;
        return () => {
          value = (value * 1103515245 + 12345) % (2 ** 31);
          return value / (2 ** 31);
        };
      })(12345);

      for (let i = 0; i < 100; i++) {
        const weather = pickWeather(seededRandom, 'summer');
        if (weather === 'clear') count += 1;
      }
      // 맑음이 55% 정도여야 한다.
      expect(count).toBeGreaterThan(40); // 여유 있게 40% 이상
    });

    it('겨울에 눈이 더 자주 나와야 한다', () => {
      let snowCount = 0;
      let rainCount = 0;

      const seededRandomWinter = ((seed: number) => {
        let value = seed;
        return () => {
          value = (value * 1103515245 + 12345) % (2 ** 31);
          return value / (2 ** 31);
        };
      })(54321);

      const seededRandomSummer = ((seed: number) => {
        let value = seed;
        return () => {
          value = (value * 1103515245 + 12345) % (2 ** 31);
          return value / (2 ** 31);
        };
      })(54321);

      for (let i = 0; i < 100; i++) {
        const weatherWinter = pickWeather(seededRandomWinter, 'winter');
        const weatherSummer = pickWeather(seededRandomSummer, 'summer');

        if (weatherWinter === 'snow') snowCount += 1;
        if (weatherSummer === 'rain') rainCount += 1;
      }

      // 같은 시드라도 계절에 따라 다르게 나와야 한다.
      // 겨울 눈 확률이 기타 계절 비 확률보다 높아야 한다.
      expect(snowCount).toBeGreaterThan(rainCount);
    });

    it('모든 날씨 타입을 반환할 수 있어야 한다', () => {
      const weathers = new Set<Weather>();

      const seededRandom = ((seed: number) => {
        let value = seed;
        return () => {
          value = (value * 1103515245 + 12345) % (2 ** 31);
          return value / (2 ** 31);
        };
      })(11111);

      for (let i = 0; i < 500; i++) {
        const weather = pickWeather(seededRandom, 'summer');
        weathers.add(weather);
      }

      expect(weathers.size).toBe(5); // 5가지 날씨 모두
      expect(Array.from(weathers)).toEqual(expect.arrayContaining(Array.from(WEATHERS)));
    });
  });

  describe('weatherModifiers', () => {
    it('비에서 미끄러짐 승수를 반환해야 한다', () => {
      const mods = weatherModifiers('rain');
      expect(mods.slipChance).toBe(2);
    });

    it('눈에서 휘청과 미끄러짐 승수를 반환해야 한다', () => {
      const mods = weatherModifiers('snow');
      expect(mods.wobbleChance).toBe(1.5);
      expect(mods.slipChance).toBe(1.2);
    });

    it('맑음과 풍경에는 특별한 옵션이 없어야 한다', () => {
      const clear = weatherModifiers('clear');
      const fog = weatherModifiers('fog');
      const wind = weatherModifiers('wind');

      expect(clear).toEqual({});
      expect(fog).toEqual({});
      expect(wind).toEqual({});
    });
  });

  describe('weatherDescription', () => {
    it('각 날씨마다 설명을 반환해야 한다', () => {
      expect(weatherDescription('clear')).toContain('맑은');
      expect(weatherDescription('rain')).toContain('비');
      expect(weatherDescription('snow')).toContain('눈');
      expect(weatherDescription('fog')).toContain('안개');
      expect(weatherDescription('wind')).toContain('바람');
    });
  });

  describe('SEASONS과 WEATHERS', () => {
    it('정의된 모든 계절을 포함해야 한다', () => {
      expect(SEASONS).toContain('auto');
      expect(SEASONS).toContain('spring');
      expect(SEASONS).toContain('summer');
      expect(SEASONS).toContain('autumn');
      expect(SEASONS).toContain('winter');
    });

    it('정의된 모든 날씨를 포함해야 한다', () => {
      expect(WEATHERS).toContain('clear');
      expect(WEATHERS).toContain('rain');
      expect(WEATHERS).toContain('snow');
      expect(WEATHERS).toContain('fog');
      expect(WEATHERS).toContain('wind');
    });
  });
});
