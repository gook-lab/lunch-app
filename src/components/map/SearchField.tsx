/**
 * 지도 쪽 찾기 칸 — 가게 찾기와 회사 위치 찾기가 같이 쓴다.
 *
 * MODUL Input·Combobox RADIO 에서 이 칸에 맞는 것만 따른다. 자동완성이 아니라 눌러서 찾는
 * 칸이라 디바운스·가상화는 없다.
 *  - <form role="search"> 의 submit 으로 찾는다. keydown Enter 는 한글 조합 중에도 불려
 *    마지막 글자가 빠진 채 찾거나 두 번 찾았다.
 *  - type=search · enterKeyHint=search(휴대폰 자판에 "검색") · autoComplete=off.
 *  - 늦게 온 응답 버리기·결과 수 알림은 부르는 쪽이 한다(요청 순번은 값을 가진 쪽 몫).
 */
import type { FormEvent } from 'react';
import { Button, Input } from '@gook-lab/ui';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder: string;
  label: string;
  loading?: boolean;
  maxLength?: number;
  className?: string;
}

export function SearchField({ value, onChange, onSearch, placeholder, label, loading = false, maxLength = 40, className }: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSearch();
  };
  return (
    <form role="search" className={className ? `add__search ${className}` : 'add__search'} onSubmit={submit}>
      <Input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={label}
      />
      <Button type="submit" loading={loading} disabled={!value.trim()}>
        찾기
      </Button>
    </form>
  );
}
