/**
 * 도둑잡기 게임 화면 (클리언트)
 * ---------------------------
 * 공개 상태(각자 남은 장수, 턴, 최근 뽑기 결과)와 내 손패를 표시합니다.
 * 내 턴이면 "카드 뽑기" 버튼으로 옆 사람에게서 뽑습니다.
 */

import { cardImagePath } from "../core/cards";
import type { Card } from "../core/cards";
import type { OldMaidPublicState } from "../core/games/oldmaid";
import type { GameClient } from "../net/client";

export class OldMaidUI {
  private hand: Card[] = []; // 내 손패
  private lastState: OldMaidPublicState | null = null;

  constructor(
    private root: HTMLElement,
    private client: GameClient,
    private myId: string | null,
  ) {}

  /** 개인 상태(내 손패) 수신 */
  handlePrivate(state: unknown): void {
    this.hand = (state as { hand: Card[] }).hand;
    if (this.lastState) this.handleGame(this.lastState);
  }

  /** 공개 상태 수신 → 화면 그리기 */
  handleGame(state: OldMaidPublicState): void {
    const isMyTurn = state.players[state.turnIndex]?.id === this.myId;

    // 참여자 목록 (남은 장수 + 탈출 여부)
    const playersHtml = state.players
      .map(
        (p, i) => `
        <li class="${i === state.turnIndex ? "current-turn" : ""} ${p.out ? "out" : ""}">
          ${p.out ? "✅ " : ""}${p.name} (${p.cardCount}장)${i === state.turnIndex ? " ⏳" : ""}
        </li>`,
      )
      .join("");

    // 내 손패 (내용은 본인만 볼 수 있음)
    const handHtml = this.hand
      .map((c) => `<img class="hand-card" src="${cardImagePath(c)}" />`)
      .join("");

    this.root.innerHTML = `
      <div class="game-table">
        <section class="mission-panel"><p>${state.lastEvent}</p></section>

        <section class="players-panel"><ul class="players">${playersHtml}</ul></section>

        <section class="my-hand">${handHtml || '<p class="muted">손패가 비었습니다!</p>'}</section>

        <footer class="game-footer">
          ${state.finished
            ? `<p class="finished">${state.players.find((p) => p.id === state.loserId)?.name ?? ""} 님이 도둑을 들고 남았습니다!</p>`
            : isMyTurn
              ? `<button id="pick-btn">옆 사람 카드 뽑기</button>`
              : `<p class="muted">${state.players[state.turnIndex]?.name ?? ""} 님이 뽑는 중...</p>`}
        </footer>
      </div>
    `;

    this.root.querySelector("#pick-btn")?.addEventListener("click", () => {
      this.client.send({ type: "action", data: { kind: "pick" } });
    });
  }
}
