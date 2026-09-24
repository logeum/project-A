/**
 * 텍사스 홀덤 (Hold'em) — 공통 타입 + 핸드 평가기
 * ------------------------------------------------
 * 파티용으로 간소화한 베팅 규칙:
 *   - 칩 100개씩 시작, 고정 베팅액 10 (한 라운드에 한 번만 벳, 레이즈 없음)
 *   - 액션: 체크 / 콜 / 벳(10) / 폴드
 *   - 프리플랍 → 플랍(3장) → 턴(1장) → 리버(1장) → 쇼다운
 *   - 쇼다운에서 남은 플레이어 전원이 핸드를 공개해 승자를 가립니다 (동점이면 팟 분할)
 */

import type { Card } from "../cards";

/** 랭크 → 숫자 값 (족보 비교용) */
export const RANK_VALUE: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  jack: 11, queen: 12, king: 13, ace: 14,
};

/** 공개용 플레이어 정보 (홀카드는 비공개) */
export interface HoldemPlayerView {
  id: string;
  name: string;
  chips: number;  // 남은 칩
  bet: number;    // 이번 라운드에서 건 칩
  folded: boolean;
}

/** 게임 단계 */
export type HoldemPhase = "preflop" | "flop" | "turn" | "river" | "showdown";

/** 서버 → 클라이언트 공개 상태 */
export interface HoldemPublicState {
  players: HoldemPlayerView[];
  community: Card[];   // 공유 카드 (0~5장)
  pot: number;
  phase: HoldemPhase;
  turnIndex: number;   // 현재 액션할 플레이어
  currentBet: number;  // 이번 라운드 기준 베팅액 (0 또는 10)
  finished: boolean;
  winners: { id: string; name: string; handName: string }[];
  lastEvent: string;
}

/** 클라이언트 → 서버 액션 */
export interface HoldemAction {
  kind: "check" | "call" | "bet" | "fold";
}

/* ---------------- 핸드 평가기 ---------------- */

/** 족보 결과 (rank가 클수록 좋음, tiebreak로 동률 비교) */
export interface HandResult {
  rank: number;
  tiebreak: number[];
  name: string;
}

/** 두 족보 비교 (양수면 a가 우승) */
export function compareResults(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 7장(홀 2 + 커뮤니티 5) 중 5장 조합 21개를 전부 검사해 최고 족보 반환 */
export function evaluate7(cards: Card[]): HandResult {
  let best: HandResult | null = null;
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) {
            const r = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareResults(r, best) > 0) best = r;
          }
  return best!;
}

/** 5장 족보 판정 */
export function evaluate5(cards: Card[]): HandResult {
  const vals = cards.map((c) => RANK_VALUE[c.rank!]).sort((x, y) => y - x);
  const flush = cards.every((c) => c.suit === cards[0].suit);

  // 스트레이트 판정 (A-2-3-4-5 "휠"도 인정)
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // A~5
  }

  // 숫자별 장수 집계 (개수 내림차순, 같으면 숫자 내림차순)
  const countMap = new Map<number, number>();
  vals.forEach((v) => countMap.set(v, (countMap.get(v) ?? 0) + 1));
  const groups = [...countMap.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);

  if (flush && straightHigh) return { rank: 8, tiebreak: [straightHigh], name: "스트레이트 플러시" };
  if (groups[0][1] === 4) return { rank: 7, tiebreak: [groups[0][0], groups[1][0]], name: "포카드" };
  if (groups[0][1] === 3 && groups[1]?.[1] === 2)
    return { rank: 6, tiebreak: [groups[0][0], groups[1][0]], name: "풀하우스" };
  if (flush) return { rank: 5, tiebreak: vals, name: "플러시" };
  if (straightHigh) return { rank: 4, tiebreak: [straightHigh], name: "스트레이트" };
  if (groups[0][1] === 3)
    return { rank: 3, tiebreak: [groups[0][0], ...vals.filter((v) => v !== groups[0][0])], name: "트리플" };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0]).sort((x, y) => y - x);
    const kicker = vals.find((v) => !pairs.includes(v))!;
    return { rank: 2, tiebreak: [...pairs, kicker], name: "투페어" };
  }
  if (groups[0][1] === 2)
    return { rank: 1, tiebreak: [groups[0][0], ...vals.filter((v) => v !== groups[0][0])], name: "원페어" };
  return { rank: 0, tiebreak: vals, name: "하이카드" };
}
