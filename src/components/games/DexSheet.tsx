/**
 * 도감 시트 — 낚시·보물찾기가 같이 쓰는 화면(10/18). 칸 모양·시트·닫기만 맡고,
 * 무엇을 모으는지(데이터·문구)는 각 게임이 넘긴다. 시트는 MODUL Sheet(네이티브 dialog)라
 * Esc·포커스 가두기·닫은 뒤 포커스 복귀는 브라우저가 한다.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Button, Sheet } from '@gook-lab/ui';
import './DexSheet.css';

export interface DexEntry {
  id: string;
  /** 찾았을 때 그림. 못 찾았으면 '?'. */
  icon: string;
  /** 찾았을 때 이름. */
  name: string;
  found: boolean;
  /** 그림 빛깔 등(찾았을 때만 적용). */
  iconStyle?: CSSProperties;
}

export interface DexGroup {
  id: string;
  label: string;
  /** 못 찾은 칸에 쓰는 말. */
  hint: string;
  /** 한 줄을 다 모았는가. */
  complete: boolean;
  entries: DexEntry[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 맨 위 한 줄(몇 개 중 몇 개). */
  summary: ReactNode;
  /** 줄 이름 뒤에 붙는 말 — "봄 물고기". */
  noun: string;
  groups: DexGroup[];
}

export function DexSheet({ open, onClose, title, summary, noun, groups }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="dex">
        <p className="dex__count">{summary}</p>
        {groups.map((g) => (
          <section key={g.id} className="dex__group" aria-label={`${g.label} ${noun}`}>
            <h3 className="dex__title">
              {g.label}
              {g.complete && <span className="dex__done"> · 다 모았어요 ✓</span>}
            </h3>
            <ul className="dex__grid">
              {g.entries.map((e) => (
                <li key={e.id} className={e.found ? 'dex__item dex__item--found' : 'dex__item'}>
                  <span className="dex__icon" style={e.found ? e.iconStyle : undefined} aria-hidden="true">
                    {e.found ? e.icon : '?'}
                  </span>
                  <span className="dex__name">{e.found ? e.name : g.hint}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Button variant="secondary" onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
