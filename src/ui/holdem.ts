/**
 * 텍사스 홀덤 게임 화면 (클리언트)
 * -------------------------------
 * 공개 상태(커뮤니티 카드, 팟, 베팅, 칩)와 내 홀카드를 표시하고,
 * 내 턴에 액션 버튼(체크/콜/벳/폴드)을 제공합니다.
 */

import { cardImagePath } from "../core/cards";
import type { Card } from "../core/cards";
import type { HoldemPublicState } from "../core/games/holdem";
import type { GameClient } from "../net/client";

export class HoldemUI {
  private hole: Card[] = []; // 내 홀카드 2장
  private lastState: HoldemPublicState | null = null;

  constructor(
    private root: HTMLElement,
    private client: GameClient,
    private myId: string | null,
  ) {}

  /** 개인 상태(내 홀카드) 수신 */
  handlePrivate(state: unknown): void {
    this.hole = (state as { hand: Card[] }).hand;
    if (this.lastState) this.handleGame(this.lastState);
  }

  /** 공개 상태 수신 → 화면 그리기 */
  handleGame(state: HoldemPublicState): void {
    const me = state.players.find((p) => p.id === this.myId);
    const isMyTurn = state.players[state.turnIndex]?.id === this.myId && !state.finished;
    const needCall = me ? state.currentBet - me.bet : 0;

    const phaseNames: Record<string, string> = {
      preflop: "프리플랍", flop: "플랍", turn: "턴", river: "리버", showdown: "쇼다운",
    };

    // 커뮤니티 카드 (뽑이지 않은 자리는 뒷면으로 표시)
    const communityHtml = state.community
      .map((c) => `<img class="hand-card" src="${cardImagePath(c)}" />`)
      .join("");

    // 내 홀카드
    const holeHtml = this.hole
      .map((c) => `<img class="hand-card" src="${cardImagePath(c)}" />`)
      .join("");

    // 참여자 상태
    const playersHtml = state.players
      .map(
        (p, i) => `
        <li class="${i === state.turnIndex && !state.finished ? "current-turn" : ""} ${p.folded ? "out" : ""}">
          ${p.folded ? "✖ " : ""}${p.name} — 칩 ${p.chips}${p.bet > 0 ? ` (벳 ${p.bet})` : ""}${i === state.turnIndex && !state.finished ? " ⏳" : ""}
        </li>`,
      )
      .join("");

    this.root.innerHTML = `
      <div class="game-table">
        <header class="game-header">
          <span>${phaseNames[state.phase] ?? state.phase}</span>
          <span class="kings">팟: ${state.pot}</span>
          <span class="muted">현재 벳: ${state.currentBet}</span>
        </header>

        <section class="community-row">
          ${communityHtml || '<p class="muted">커뮤니티 카드 대기 중</p>'}
        </section>

        <section class="my-hole">
          <p class="muted">내 카드</p>
          ${holeHtml}
        </section>

        <section class="mission-panel"><p>${state.lastEvent}</p></section>

        <section class="players-panel"><ul class="players">${playersHtml}</ul></section>

        <footer class="game-footer">
          ${state.finished
            ? `<p class="finished">${state.winners.map((w) => `${w.name} (${w.handName})`).join(", ")} 승리!</p>`
            : isMyTurn
              ? `<div class="action-row">
                   <button id="check-btn" ${needCall > 0 ? "disabled" : ""}>체크</button>
                   <button id="call-btn" ${needCall <= 0 ? "disabled" : ""}>콜${needCall > 0 ? ` (${Math.min(needCall, me?.chips ?? 0)})` : ""}</button>
                   <button id="bet-btn" ${state.currentBet > 0 || (me?.chips ?? 0) <= 0 ? "disabled" : ""}>벳 10</button>
                   <button id="fold-btn">폴드</button>
                 </div>`
              : `<p class="muted">${state.players[state.turnIndex]?.name ?? ""} 님의 액션 대기 중...</p>`}
        </footer>
      </div>
    `;

    // 액션 버튼 연결
    const send = (kind: string) => this.client.send({ type: "action", data: { kind } });
    this.root.querySelector("#check-btn")?.addEventListener("click", () => send("check"));
    this.root.querySelector("#call-btn")?.addEventListener("click", () => send("call"));
    this.root.querySelector("#bet-btn")?.addEventListener("click", () => send("bet"));
    this.root.querySelector("#fold-btn")?.addEventListener("click", () => send("fold"));
  }
}
