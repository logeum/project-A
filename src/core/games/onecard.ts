/**
 * 원카드 (One Card) — 공통 타입
 * ------------------------------
 * 서버와 클라이언트가 공유하는 원카드 타입 정의.
 * 규칙(간소화된 한국식 원카드):
 *   - 위 카드와 같은 무늬 또는 같은 숫자/문자의 카드를 냅니다.
 *   - 2: +2 / A: +3 / 조커: +5 누적 공격 (같은 공격카드로 중첩 가능)
 *   - 3: 공격 방어 (누적된 카드 먹기 취소)
 *   - K: 진행 방향 반전 / Q: 다음 사람 걸러뛰기
 *   - 손에 1장 남기고 "원카드" 선언(declare) 안 하면 벌칙 +2장
 *   - 손패 0장이 되면 승리
 */

import type { Card } from "../cards";

/** 공개용 플레이어 정보 (손패 개수까지만 공개) */
export interface OneCardPlayerView {
  id: string;
  name: string;
  cardCount: number;
}

/** 서버 → 클라이언트 공개 상태 */
export interface OneCardPublicState {
  players: OneCardPlayerView[];  // 진행 순서
  turnIndex: number;             // 현재 턴 인덱스
  direction: 1 | -1;             // 진행 방향 (1: 정방향, -1: 역방향)
  topCard: Card;                 // 바닥에 깔린 맨 위 카드
  pendingDraw: number;           // 누적된 "먹어야 할" 카드 수 (0이면 일반 턴)
  deckSize: number;              // 남은 덱 장수
  finished: boolean;
  winnerId: string | null;
  lastEvent: string;             // 최근 게임 이벤트 설명 (UI 표시용)
}

/** 클라이언트 → 서버 액션 */
export interface OneCardAction {
  kind: "play" | "draw";
  card?: Card;    // play: 낼 카드
  declare?: boolean; // play 후 손이 1장이 될 때 원카드 선언 여부
}
