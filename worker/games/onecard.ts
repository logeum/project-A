/**
 * 원카드 게임 로직 (서버 측)
 * --------------------------
 * 모든 손패와 덱은 서버만 알고 있고, 클라이언트에는
 * 공개 상태(맨 위 카드, 각자 장수)와 "본인 패"만 전송합니다.
 * 카드 내기 시 반드시 손에 있는 카드인지 검사하므로 치트가 불가능합니다.
 */

import { buildDeck, shuffle, type Card } from "../../src/core/cards";
import type { GameHooks } from "../../src/core/games/hooks";
import type {
  OneCardAction,
  OneCardPlayerView,
  OneCardPublicState,
} from "../../src/core/games/onecard";

/** 시작 시 각자 받는 카드 수 */
const HAND_SIZE = 7;
/** 누적 공격으로 한 번에 먹는 기본 카드 수 (공격 없을 때) */
const BASE_DRAW = 1;
/** 원카드 미선언 벌칙 장수 */
const PENALTY = 2;

/** 같은 카드인지 비교 (덱 2장씩 있으므로 값 비교만 함) */
function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank && a.joker === b.joker;
}

/** 공격 카드 여부 */
function isAttack(card: Card): boolean {
  return card.rank === "2" || card.rank === "ace" || !!card.joker;
}

/** 공격 카드의 누적량 */
function attackValue(card: Card): number {
  if (card.joker) return 5;
  if (card.rank === "ace") return 3;
  return 2; // 2
}

/** 효과 없는 시작 카드가 나올 때 사용 (K/Q/2/A/조커는 효과 카드) */
function isEffectCard(card: Card): boolean {
  return isAttack(card) || card.rank === "king" || card.rank === "queen";
}

export class OneCardGame {
  private players: OneCardPlayerView[];      // 공개용 (진행 순서)
  private hands = new Map<string, Card[]>(); // 비공개: 플레이어별 손패
  private deck: Card[] = [];                 // 비공개: 남은 덱
  private discard: Card[] = [];              // 버린 카드 더미 (덱 소진 시 재사용)
  private top: Card;                         // 바닥 맨 위 카드
  private turnIndex = 0;
  private direction: 1 | -1 = 1;
  private pending = 0;                       // 누적된 먹을 카드 수
  private finished = false;
  private winnerId: string | null = null;
  private lastEvent = "";

  constructor(
    players: { id: string; name: string }[],
    private hooks: GameHooks,
  ) {
    this.players = players.map((p) => ({ ...p, cardCount: 0 }));
    // 2덱 + 조커 2장 (10명이면 7장씩 = 70장 필요)
    this.deck = shuffle(buildDeck(2, 2));
    for (const p of players) {
      this.hands.set(p.id, this.deck.splice(0, HAND_SIZE));
    }
    // 시작 카드: 효과 카드가 아닌 카드가 나올 때까지 뽑기
    do {
      this.top = this.deck.pop()!;
      this.discard.push(this.top);
    } while (isEffectCard(this.top) && this.deck.length > 0);
    this.lastEvent = "게임 시작! 같은 무늬나 숫자를 맞춰 카드를 내세요.";
    this.emitAll();
  }

  /** 액션 처리 (턴 검증 포함) */
  handleAction(playerId: string, data: unknown): void {
    if (this.finished) return;
    const current = this.players[this.turnIndex];
    if (!current || current.id !== playerId) return; // 남의 턴 액션 무시
    const action = data as OneCardAction;

    if (action.kind === "draw") {
      this.drawCards(playerId);
      this.endTurn(false);
      return;
    }
    if (action.kind === "play" && action.card) {
      this.playCard(playerId, action.card, !!action.declare);
    }
  }

  /** 플레이어 퇴장 처리: 손패를 덱에 합치고 목록에서 제거 */
  removePlayer(playerId: string): void {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    const hand = this.hands.get(playerId) ?? [];
    this.deck.push(...hand); // 남은 카드는 덱으로 돌림
    this.hands.delete(playerId);
    this.players.splice(idx, 1);
    if (this.players.length === 0) return;
    if (this.turnIndex >= this.players.length) this.turnIndex = 0;
    else if (idx < this.turnIndex) this.turnIndex--;
    this.lastEvent = "한 명이 게임을 떠났습니다.";
    this.emitAll();
  }

  /** 카드 내기 */
  private playCard(playerId: string, card: Card, declare: boolean): void {
    const hand = this.hands.get(playerId)!;
    // 치트 방지: 실제 손에 있는 카드인지 확인
    const idx = hand.findIndex((c) => sameCard(c, card));
    if (idx < 0) return;
    // 규칙 검증: 무늬/숫자 일치 또는 조커
    if (!this.canPlay(card)) return;
    // 공격 누적 중에는 "공격 카드로 중첩" 또는 "3으로 방어"만 가능
    if (this.pending > 0 && card.rank !== "3" && !isAttack(card)) return;

    // 카드 제출
    hand.splice(idx, 1);
    this.discard.push(card);
    this.top = card;
    const name = this.players[this.turnIndex].name;

    if (card.rank === "3") {
      this.pending = 0;
      this.lastEvent = `${name} 님이 3으로 공격을 방어했습니다!`;
    } else if (isAttack(card)) {
      this.pending += attackValue(card);
      this.lastEvent = `${name} 님이 ${card.joker ? "조커" : card.rank}로 +${attackValue(card)} 공격! (누적 ${this.pending}장)`;
    } else if (card.rank === "king") {
      this.direction = this.direction === 1 ? -1 : 1;
      this.lastEvent = `${name} 님이 방향을 반전했습니다!`;
    } else if (card.rank === "queen") {
      this.lastEvent = `${name} 님이 다음 사람을 걸러뛰게 했습니다!`;
    } else {
      this.lastEvent = `${name} 님이 카드를 냈습니다.`;
    }

    // 원카드(1장 남음) 처리
    if (hand.length === 1) {
      if (declare) {
        this.lastEvent += " 원카드!";
      } else {
        this.drawToHand(playerId, PENALTY);
        this.lastEvent += ` (원카드 미선언! 벌칙 +${PENALTY}장)`;
      }
    }

    // 승리 판정
    if (hand.length === 0) {
      this.finished = true;
      this.winnerId = playerId;
      this.lastEvent = `${name} 님이 카드를 모두 비웠습니다. 승리!`;
      this.emitAll();
      return;
    }
    this.endTurn(card.rank === "queen"); // Q면 한 명 걸러뛰기
  }

  /** 카드 먹기 (공격 누적 시 누적분 전부, 아니면 1장) 후 턴 종료 */
  private drawCards(playerId: string): void {
    const n = this.pending > 0 ? this.pending : BASE_DRAW;
    this.drawToHand(playerId, n);
    const name = this.players[this.turnIndex].name;
    this.lastEvent = `${name} 님이 카드 ${n}장을 먹었습니다.`;
    this.pending = 0;
  }

  /** 덱에서 n장을 뽑아 손패에 추가 (덱 부족 시 버린 더미를 섞어 재사용) */
  private drawToHand(playerId: string, n: number): void {
    const hand = this.hands.get(playerId)!;
    for (let i = 0; i < n; i++) {
      if (this.deck.length === 0) this.reshuffle();
      const c = this.deck.pop();
      if (!c) break;
      hand.push(c);
    }
  }

  /** 버린 더미(맨 위 카드 제외)를 섞어 덱으로 재구성 */
  private reshuffle(): void {
    if (this.discard.length <= 1) return;
    const top = this.discard.pop()!;
    this.deck = shuffle(this.discard);
    this.discard = [top];
  }

  /** 규칙 검증: 무늬/숫자 일치 또는 조커 */
  private canPlay(card: Card): boolean {
    if (card.joker) return true;
    return card.suit === this.top.suit || card.rank === this.top.rank;
  }

  /** 턴 종료 후 다음 사람으로 이동 (skip면 한 명 추가로 걸러뛰기) */
  private endTurn(skip: boolean): void {
    if (this.finished) return;
    const steps = skip ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      this.turnIndex = (this.turnIndex + this.direction + this.players.length) % this.players.length;
    }
    this.emitAll();
  }

  /** 공개 상태 전송 + 개인별 손패 전송 */
  private emitAll(): void {
    const state: OneCardPublicState = {
      players: this.players.map((p) => ({
        ...p,
        cardCount: this.hands.get(p.id)?.length ?? 0,
      })),
      turnIndex: this.turnIndex,
      direction: this.direction,
      topCard: this.top,
      pendingDraw: this.pending,
      deckSize: this.deck.length,
      finished: this.finished,
      winnerId: this.winnerId,
      lastEvent: this.lastEvent,
    };
    this.hooks.broadcast(state);
    // 각자의 손패는 본인에게만 전송 (비공개)
    for (const p of this.players) {
      this.hooks.sendTo(p.id, { hand: this.hands.get(p.id) ?? [] });
    }
  }
}
