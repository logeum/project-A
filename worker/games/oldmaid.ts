/**
 * 도둑잡기 게임 로직 (서버 측)
 * --------------------------
 * 모든 손패는 서버만 알고 있고, 클라이언트에는 본인 패만 전송됩니다.
 * 뽑기 대상 카드도 서버가 무작위로 정하므로 결과 조작이 불가능합니다.
 */

import { buildDeck, shuffle, type Card } from "../../src/core/cards";
import type { GameHooks } from "../../src/core/games/hooks";
import type {
  OldMaidAction,
  OldMaidPlayerView,
  OldMaidPublicState,
} from "../../src/core/games/oldmaid";

/** 같은 카드 비교 */
function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank && a.joker === b.joker;
}

/** 카드 이름 표시용 */
function cardLabel(card: Card): string {
  if (card.joker) return "조커(도둑)";
  const names: Record<string, string> = { jack: "J", queen: "Q", king: "K", ace: "A" };
  return `${names[card.rank ?? ""] ?? card.rank}${{ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit ?? "spades"]}`;
}

export class OldMaidGame {
  private players: OldMaidPlayerView[];      // 공개용
  private hands = new Map<string, Card[]>(); // 비공개 손패
  private turnIndex = 0;
  private finished = false;
  private loserId: string | null = null;
  private lastEvent = "";

  constructor(
    players: { id: string; name: string }[],
    private hooks: GameHooks,
  ) {
    this.players = players.map((p) => ({ ...p, cardCount: 0, out: false }));
    // 2덱 + 조커 1장 (조커 = 도둑)
    const deck = shuffle(buildDeck(2, 1));
    // 카드 전체 나눠주기 (한 장씩 순환)
    deck.forEach((card, i) => {
      const p = players[i % players.length];
      this.hands.get(p.id)?.push(card) ?? this.hands.set(p.id, [card]);
    });
    // 초기 페어 정리: 같은 숫자 2장씩 자동 제거
    for (const p of players) this.removePairs(p.id);
    // 손패 0장인 사람은 바로 탈출 처리
    for (const p of this.players) p.out = (this.hands.get(p.id)?.length ?? 0) === 0;
    this.lastEvent = "페어를 정리했습니다. 조커를 가진 사람이 도둑!";
    this.emitAll();
  }

  /** 액션 처리 (턴 검증 포함) */
  handleAction(playerId: string, data: unknown): void {
    if (this.finished) return;
    const current = this.players[this.turnIndex];
    if (!current || current.id !== playerId) return;
    const action = data as OldMaidAction;
    if (action.kind !== "pick") return;

    // 뽑을 대상: 나의 다음 활성 플레이어
    const victimIndex = this.nextActive(this.turnIndex);
    if (victimIndex < 0 || victimIndex === this.turnIndex) {
      return this.checkEnd(); // 뽑을 사람이 없으면 종료 확인
    }
    const victim = this.players[victimIndex];
    const victimHand = this.hands.get(victim.id)!;

    // 무작위로 1장 선택 (암호학적 난수)
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const picked = victimHand[buf[0] % victimHand.length];

    // 카드 이동: 피해자 → 현재 플레이어
    victimHand.splice(victimHand.findIndex((c) => sameCard(c, picked)), 1);
    this.hands.get(playerId)!.push(picked);

    this.lastEvent = `${current.name} 님이 ${victim.name} 님에게서 ${cardLabel(picked)}을 뽑았습니다.`;

    // 뽑은 카드로 페어가 완성되면 자동 제거
    if (this.removePairs(playerId)) {
      this.lastEvent += " 페어! 두 장을 버렸습니다.";
    }

    // 탈출(패 0장) 처리
    const handCounts = this.players.map((p) => this.hands.get(p.id)?.length ?? 0);
    this.players.forEach((p, i) => (p.out = handCounts[i] === 0));

    if (!this.checkEnd()) {
      // 다음 턴: 현재 자리 기준 다음 활성 플레이어 (현재 플레이어가 탈출한 경우에도 동일)
      this.turnIndex = this.nextActiveFrom(this.turnIndex);
      this.emitAll();
    }
  }

  /** 플레이어 퇴장 처리 */
  removePlayer(playerId: string): void {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    // 손패는 사라지고(조커까지) 해당 플레이어 제거
    this.hands.delete(playerId);
    this.players.splice(idx, 1);
    if (this.players.length === 0) return;
    if (this.turnIndex >= this.players.length) this.turnIndex = 0;
    else if (idx < this.turnIndex) this.turnIndex--;
    this.lastEvent = "한 명이 게임을 떠났습니다.";
    if (!this.checkEnd()) this.emitAll();
  }

  /** 손패에서 같은 숫자 페어를 전부 제거. 페어를 제거했으면 true 반환 */
  private removePairs(playerId: string): boolean {
    const hand = this.hands.get(playerId)!;
    const byRank = new Map<string, Card[]>();
    for (const c of hand) {
      if (c.joker) continue; // 조커는 페어 안 됨
      const key = c.rank!;
      byRank.set(key, [...(byRank.get(key) ?? []), c]);
    }
    let removed = false;
    for (const cards of byRank.values()) {
      while (cards.length >= 2) {
        const [a, b] = [cards.pop()!, cards.pop()!];
        const i1 = hand.findIndex((c) => sameCard(c, a));
        hand.splice(i1, 1);
        const i2 = hand.findIndex((c) => sameCard(c, b));
        hand.splice(i2, 1);
        removed = true;
      }
    }
    return removed;
  }

  /** idx 다음의 활성(탈출 안 한) 플레이어 인덱스. 없으면 -1 */
  private nextActive(from: number): number {
    for (let i = 1; i < this.players.length; i++) {
      const j = (from + i) % this.players.length;
      if (!this.players[j].out) return j;
    }
    return -1;
  }

  /** from(포함) 이후 첫 활성 플레이어 인덱스 */
  private nextActiveFrom(from: number): number {
    for (let i = 0; i < this.players.length; i++) {
      const j = (from + i) % this.players.length;
      if (!this.players[j].out) return j;
    }
    return 0;
  }

  /** 종료 조건 확인: 카드 들고 남은 사람이 1명이면 그 사람이 패배 */
  private checkEnd(): boolean {
    const remaining = this.players.filter((p) => !p.out);
    if (remaining.length <= 1) {
      this.finished = true;
      this.loserId = remaining[0]?.id ?? null;
      this.lastEvent = remaining.length === 1
        ? `${remaining[0].name} 님이 도둑(조커)를 들고 남았습니다!`
        : "모두 탈출했습니다!";
      this.emitAll();
      return true;
    }
    return false;
  }

  /** 공개 상태 + 개인별 손패 전송 */
  private emitAll(): void {
    const state: OldMaidPublicState = {
      players: this.players.map((p) => ({
        ...p,
        cardCount: this.hands.get(p.id)?.length ?? 0,
      })),
      turnIndex: this.turnIndex,
      finished: this.finished,
      loserId: this.loserId,
      lastEvent: this.lastEvent,
    };
    this.hooks.broadcast(state);
    for (const p of this.players) {
      this.hooks.sendTo(p.id, { hand: this.hands.get(p.id) ?? [] });
    }
  }
}
