/**
 * 도둑잡기 (Old Maid) — 공통 타입
 * --------------------------------
 * 규칙:
 *   - 2덱 + 조커 1장(도둑). 카드를 모두 나눠 준 뒤 같은 숫자끼리 자동으로 버립니다.
 *   - 자신의 차례에 옆(다음) 사람의 패에서 무작위로 1장을 뽑습니다.
 *   - 뽑은 카드가 내 패의 어떤 카드와 같은 숫자면 두 장 모두 버립니다.
 *   - 패를 먼저 비우면 탈출. 끝까지 조커(도둑)를 들고 남는 사람이 패배.
 */

import type { Card } from "../cards";

/** 공개용 플레이어 정보 */
export interface OldMaidPlayerView {
  id: string;
  name: string;
  cardCount: number;
  out: boolean; // 이미 탈출(패 비움)했는지
}

/** 서버 → 클라이언트 공개 상태 */
export interface OldMaidPublicState {
  players: OldMaidPlayerView[];
  turnIndex: number;      // 현재 뽑을 사람 인덱스
  finished: boolean;
  loserId: string | null; // 도둑을 들고 남은 사람
  lastEvent: string;      // 최근 뽑기 결과 설명
}

/** 클라이언트 → 서버 액션 (현재 턴 플레이어만 pick 가능) */
export interface OldMaidAction {
  kind: "pick";
}
