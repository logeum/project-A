/**
 * 텍사스 홀덤 게임 로직 (서버 측)
 * ------------------------------
 * 파티용 간소화 규칙:
 *   - 칩 100개씩 시작, 고정 베팅액 10, 한 라운드에 한 번만 벳 (레이즈 없음)
 *   - 액션: 체크 / 콜 / 벳 / 폴드
 *   - 프리플랍 → 플랍(3) → 턴(1) → 리버(1) → 쇼다운
 * 홀카드는 서버만 알고 있으며 각자에게만 전송됩니다.
 */

import { buildDeck, shuffle, type Card } from "../../src/core/cards";
import type { GameHooks } from "../../src/core/games/hooks";
import {
  compareResults,
  evaluate7,
  type HoldemAction,
  type HoldemPhase,
  type HoldemPlayerView,
  type HoldemPublicState,
} from "../../src/core/games/holdem";

/** 시작 칩 */
const START_CHIPS = 100;
/** 고정 베팅액 */
const BET_SIZE = 10;

/** 남은 플레이어(서버 낸부용, 홀카드 포함) */
interface HoldemPlayerInternal extends HoldemPlayerView {
  hole: Card[]; // 홀카드 2장 (비공개)
  acted: boolean; // 이번 라운드 액션 완료 여부
}

export class HoldemGame {
  private players: HoldemPlayerInternal[]; // 진행 순서
  private deck: Card[] = [];
  private community: Card[] = [];
  private pot = 0;
  private phase: HoldemPhase = "preflop";
  private turnIndex = 0;
  private currentBet = 0;
  private finished = false;
  private winners: { id: string; name: string; handName: string }[] = [];
  private lastEvent = "";

  constructor(
    players: { id: string; name: string }[],
    private hooks: GameHooks,
  ) {
    this.players = players.map((p) => ({
      ...p,
      chips: START_CHIPS,
      bet: 0,
      folded: false,
      hole: [],
      acted: false,
    }));
    this.deck = shuffle(buildDeck(1, 0)); // 1덱 52장
    // 홀카드 2장씩
    for (const p of this.players) {
      p.hole = [this.deck.pop()!, this.deck.pop()!];
    }
    this.lastEvent = "프리플랍입니다. 액션을 선택하세요.";
    this.emitAll();
  }

  /** 액션 처리 (턴 검증 포함) */
  handleAction(playerId: string, data: unknown): void {
    if (this.finished) return;
    const current = this.players[this.turnIndex];
    if (!current || current.id !== playerId || current.folded) return;
    const action = data as HoldemAction;
    const name = current.name;

    switch (action.kind) {
      case "check":
        // 베팅이 없는 경우에만 체크 가능
        if (this.currentBet > current.bet) return;
        current.acted = true;
        this.lastEvent = `${name} 님이 체크했습니다.`;
        break;
      case "call": {
        // 현재 베팅에 맞춤 (칩 부족 시 전부 올인)
        const need = this.currentBet - current.bet;
        if (need <= 0) return;
        const pay = Math.min(need, current.chips);
        current.chips -= pay;
        current.bet += pay;
        current.acted = true;
        this.lastEvent = `${name} 님이 콜했습니다.`;
        break;
      }
      case "bet":
        // 아직 베팅이 없는 라운드에서만 벳 가능 (한 라운드 1회 제한)
        if (this.currentBet > 0 || current.chips <= 0) return;
        this.currentBet = BET_SIZE;
        {
          const pay = Math.min(BET_SIZE, current.chips);
          current.chips -= pay;
          current.bet += pay;
        }
        current.acted = true;
        this.lastEvent = `${name} 님이 ${BET_SIZE}을 벳했습니다.`;
        break;
      case "fold":
        current.folded = true;
        current.acted = true;
        this.lastEvent = `${name} 님이 폴드했습니다.`;
        break;
    }
    this.advance();
  }

  /** 플레이어 퇴장 처리 */
  removePlayer(playerId: string): void {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    this.players.splice(idx, 1);
    if (this.players.length === 0) return;
    if (this.turnIndex >= this.players.length) this.turnIndex = 0;
    else if (idx < this.turnIndex) this.turnIndex--;
    this.lastEvent = "한 명이 게임을 떠났습니다.";
    this.advance();
  }

  /**
   * 턴 진행: 폴드로 한 명만 남으면 즉시 승리,
   * 아니면 라운드 완료 시 다음 스트리트로 진행.
   */
  private advance(): void {
    const alive = this.players.filter((p) => !p.folded);
    // 한 명만 남으면 바로 승리
    if (alive.length === 1) {
      this.pot += this.players.reduce((s, p) => s + p.bet, 0);
      this.winners = [{ id: alive[0].id, name: alive[0].name, handName: "모두 폴드" }];
      this.phase = "showdown";
      this.finished = true;
      this.lastEvent = `${alive[0].name} 님이 상대 폴드로 팟을 가져갑니다!`;
      this.emitAll();
      return;
    }

    // 라운드 완료 조건: 살아있는 전원이 액션했고 베팅액이 같음
    const roundDone =
      alive.every((p) => p.acted) && alive.every((p) => p.bet === this.currentBet);
    if (!roundDone) {
      this.turnIndex = this.nextActor(this.turnIndex);
      this.emitAll();
      return;
    }

    // 팟 정산 및 다음 스트리트
    this.pot += this.players.reduce((s, p) => s + p.bet, 0);
    this.players.forEach((p) => {
      p.bet = 0;
      p.acted = false;
    });
    this.currentBet = 0;

    if (this.phase === "preflop") {
      this.phase = "flop";
      this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
      this.lastEvent = "플랍이 공개되었습니다.";
    } else if (this.phase === "flop") {
      this.phase = "turn";
      this.community.push(this.deck.pop()!);
      this.lastEvent = "턴 카드가 공개되었습니다.";
    } else if (this.phase === "turn") {
      this.phase = "river";
      this.community.push(this.deck.pop()!);
      this.lastEvent = "리버 카드가 공개되었습니다.";
    } else {
      // 리버까지 끝나면 쇼다운
      this.showdown();
      return;
    }
    this.turnIndex = this.firstAlive();
    this.emitAll();
  }

  /** 쇼다운: 남은 플레이어의 7장으로 족보를 가려 팟 분배 */
  private showdown(): void {
    this.phase = "showdown";
    const alive = this.players.filter((p) => !p.folded);
    const results = alive.map((p) => ({
      player: p,
      result: evaluate7([...p.hole, ...this.community]),
    }));
    let best = results[0];
    for (const r of results) {
      if (compareResults(r.result, best.result) > 0) best = r;
    }
    const winning = results.filter((r) => compareResults(r.result, best.result) === 0);
    // 팟 분할 (나눠떨어지지 않으면 앞 사람부터 1개씩 추가)
    const share = Math.floor(this.pot / winning.length);
    let remainder = this.pot % winning.length;
    for (const w of winning) {
      w.player.chips += share + (remainder-- > 0 ? 1 : 0);
    }
    this.winners = winning.map((w) => ({
      id: w.player.id,
      name: w.player.name,
      handName: w.result.name,
    }));
    this.pot = 0;
    this.finished = true;
    this.lastEvent = `${this.winners.map((w) => `${w.name}(${w.handName})`).join(", ")} 님 승리!`;
    this.emitAll();
  }

  /** idx 이후의 다음 활성(폴드 안 한) 플레이어 인덱스 */
  private nextActor(from: number): number {
    for (let i = 1; i <= this.players.length; i++) {
      const j = (from + i) % this.players.length;
      if (!this.players[j].folded) return j;
    }
    return from;
  }

  /** 첫 활성 플레이어 인덱스 */
  private firstAlive(): number {
    return this.players.findIndex((p) => !p.folded);
  }

  /** 공개 상태 + 홀카드 개인 전송 */
  private emitAll(): void {
    const state: HoldemPublicState = {
      players: this.players.map(({ id, name, chips, bet, folded }) => ({
        id, name, chips, bet, folded,
      })),
      community: this.community,
      pot: this.pot,
      phase: this.phase,
      turnIndex: this.turnIndex,
      currentBet: this.currentBet,
      finished: this.finished,
      winners: this.winners,
      lastEvent: this.lastEvent,
    };
    this.hooks.broadcast(state);
    // 홀카드는 본인에게만 전송
    for (const p of this.players) {
      this.hooks.sendTo(p.id, { hand: p.hole });
    }
  }
}
