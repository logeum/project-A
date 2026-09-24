/**
 * 원카드 게임 화면 (클리언트)
 * ---------------------------
 * 공개 상태(맨 위 카드, 누적 공격, 방향 등)와 내 손패(private 메시지)를
 * 받아 화면을 그립니다. 내 손패 카드를 클릭하면 play 액션을 전송합니다.
 */

import { cardImagePath } from "../core/cards";
import type { Card } from "../core/cards";
import type { OneCardPublicState } from "../core/games/onecard";
import type { GameClient } from "../net/client";

export class OneCardUI {
  private hand: Card[] = []; // 내 손패 (private 메시지로 수신)
  private lastState: OneCardPublicState | null = null; // 최근 공개 상태 (재렌더링용)

  constructor(
    private root: HTMLElement,
    private client: GameClient,
    private myId: string | null,
  ) {}

  /** 개인 상태(내 손패) 수신 — 저장 후 화면 갱신 (서버가 공개 상태 다음에 전송하므로) */
  handlePrivate(state: unknown): void {
    this.hand = (state as { hand: Card[] }).hand;
    if (this.lastState) this.handleGame(this.lastState);
  }

  /** 공개 상태 수신 → 화면 전체 다시 그리기 */
  handleGame(state: OneCardPublicState): void {
    this.lastState = state;
    const me = state.players.find((p) => p.id === this.myId);
    const isMyTurn = state.players[state.turnIndex]?.id === this.myId;

    // 내 손패 렌더링 (클릭 = 카드 내기)
    const handHtml = this.hand
      .map(
        (c, i) => `
        <img class="hand-card" data-i="${i}" src="${cardImagePath(c)}"
             title="${c.joker ? "조커" : c.rank}" />`,
      )
      .join("");

    const playersHtml = state.players
      .map(
        (p, i) => `
        <li class="${i === state.turnIndex ? "current-turn" : ""}">
          ${p.name} (${p.cardCount}장)${i === state.turnIndex ? " ⏳" : ""}
        </li>`,
      )
      .join("");

    this.root.innerHTML = `
      <div class="game-table">
        <header class="game-header">
          <span>${state.direction === 1 ? "▶" : "◀"} 방향</span>
          <span class="${state.pendingDraw > 0 ? "attack-banner" : ""}">
            ${state.pendingDraw > 0 ? `⚠️ 먹어야 할 카드: ${state.pendingDraw}장` : `남은 덱: ${state.deckSize}장`}
          </span>
        </header>

        <section class="top-card-area">
          <p class="muted">맨 위 카드</p>
          <img class="top-card" src="${cardImagePath(state.topCard)}" />
        </section>

        <section class="mission-panel">
          <p>${state.lastEvent}</p>
          ${me ? `<p class="muted">내 손패: ${me.cardCount}장</p>` : ""}
        </section>

        <section class="players-panel"><ul class="players">${playersHtml}</ul></section>

        <section class="my-hand">${handHtml}</section>

        <footer class="game-footer">
          ${state.finished
            ? `<p class="finished">${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} 님 승리!</p>`
            : isMyTurn
              ? `<button id="draw-btn">카드 먹기</button>
                 <p class="muted">손패의 카드를 클릭하면 냅니다</p>`
              : `<p class="muted">${state.players[state.turnIndex]?.name ?? ""} 님의 차례...</p>`}
        </footer>
      </div>
    `;

    // 카드 클릭 → play 액션 (2장 남은 상태면 원카드 선언 플래그 포함)
    this.root.querySelectorAll(".hand-card").forEach((el) => {
      el.addEventListener("click", () => {
        const card = this.hand[Number((el as HTMLElement).dataset.i)];
        if (!card) return;
        this.client.send({
          type: "action",
          data: { kind: "play", card, declare: this.hand.length === 2 },
        });
      });
    });
    // 카드 먹기 버튼
    this.root.querySelector("#draw-btn")?.addEventListener("click", () => {
      this.client.send({ type: "action", data: { kind: "draw" } });
    });
  }
}
