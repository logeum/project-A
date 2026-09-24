/**
 * 카드(트럼프) 공통 로직
 * --------------------
 * - 덱 생성 (덱 수, 조커 수 지정 가능 — 10인 플레이용 2덱 지원)
 * - 셔플 (Fisher-Yates 알고리즘)
 * - 카드 → 이미지 파일 경로 매핑
 * 프론트(표시용)와 워커(검증용) 양쪽에서 사용합니다.
 */

/** 무늬 4종 */
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

/** 숫자/문자 (J/Q/K/A 포함) */
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "jack" | "queen" | "king" | "ace";

/** 조커 구분용 */
export type JokerKind = "red" | "black";

/** 카드 한 장을 표현하는 최소 정보 (이미지 파일명과 1:1 대응) */
export interface Card {
  suit: Suit | null;  // 조커는 무늬가 없음 (null)
  rank: Rank | null;  // 조커는 숫자가 없음 (null)
  joker?: JokerKind;  // 조커일 때만 존재
}

/** 무늬별 기본 색상 (하트/다이아=빨강, 스페이드/클로버=검정) */
export const SUIT_COLORS: Record<Suit, "red" | "black"> = {
  hearts: "red",
  diamonds: "red",
  spades: "black",
  clubs: "black",
};

/**
 * 트럼프 덱을 생성합니다.
 * @param deckCount  사용할 덱 수 (기본 1덱=52장, 10인용으로 2덱=104장)
 * @param jokerCount 조커 수 (기본 0장)
 */
export function buildDeck(deckCount = 1, jokerCount = 0): Card[] {
  const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
  const ranks: Rank[] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10",
    "jack", "queen", "king", "ace",
  ];

  const deck: Card[] = [];
  // 덱 수만큼 반복해서 카드를 채웁니다 (2덱이면 같은 카드가 2장씩 존재)
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
  }
  // 조커 추가 (빨강/검정을 번갈아가며)
  for (let j = 0; j < jokerCount; j++) {
    deck.push({ suit: null, rank: null, joker: j % 2 === 0 ? "red" : "black" });
  }
  return deck;
}

/**
 * Fisher-Yates 셔플 (공정한 무작위 섞기)
 * 배열을 복사하지 않고 입력받은 배열을 직접 섞습니다.
 */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    // 0..i 사이의 무작위 인덱스를 뽑아 현재 위치와 교환
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 카드 → 이미지 경로 매핑
 * public/assets/cards/ 에 있는 SVG 파일명 규칙과 동일합니다.
 * 예: {suit:"spades", rank:"ace"} → "/assets/cards/ace_of_spades.svg"
 *     조커 → "/assets/cards/red_joker.svg"
 */
export function cardImagePath(card: Card): string {
  if (card.joker) {
    return `/assets/cards/${card.joker}_joker.svg`;
  }
  return `/assets/cards/${card.rank}_of_${card.suit}.svg`;
}

/** 카드 뒷면 이미지 경로 */
export const CARD_BACK_PATH = "/assets/cards/back.png";
