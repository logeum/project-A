/**
 * 킹스 컵 게임 화면 (클리이언트)
 * ----------------------------
 * 서버가 전송하는 KingsCupPublicState를 받아 화면에 그립니다.
 * 화면 구성: 킹 진행 상황 / 남은 덱 / 뽑힌 카드 + 미션 / 참여자 목록 / 뽑기 버튼.
 * "뽑기" 버튼은 내 턴일 때만 눌리며, 실제 카드 처리는 서버가 검증합니다.
 */

import { CARD_BACK_PATH, cardImagePath } from "../core/cards";
import {
  KINGS_CUP_MISSIONS,
  type KingsCupPublicState,
} from "../core/games/kingscup";
import type { GameClient } from "../net/client";

export class KingsCupUI {
  /** 화면을 그릴 컨테이너와 통신/식별용 의존성 */
  constructor(
    private root: HTMLElement,
    private client: GameClient,
    private myId: string | null, // 내 플레이어 ID (내 턴 판정용)
  ) {}

  /**
   * 서버로부터 받은 게임 상태로 화면을 다시 그립니다.
   * 서버가 상태를 볼때마다 호출되므로 이 메서드는 "전체 다시 그리기"를 전제합니다.
   */
  handleGame(state: KingsCupPublicState): void {
    const isMyTurn = state.players[state.turnIndex]?.id === this.myId;
    const last = state.revealed[state.revealed.length - 1];
    const mission = last ? KINGS_CUP_MISSIONS[last.card.rank ?? ""] : null;

    // 남은 덱: 카드 뒷면 이미지를 그리드로 표시 (실제 카드 내용은 서버만 알고 있음)
    const deckHtml = Array.from(
      { length: Math.min(state.deckSize, 15) }, // 화면 과밀 방지: 최대 15장만 표시
      () => `<img class="card-back-mini" src="${CARD_BACK_PATH}" alt="카드 뒷면" />`,
    ).join("");

    // 뽑힌 카드들: 앞면 이미지 + 뽑은 사람 이름
    const revealedHtml = state.revealed
      .slice(-8) // 최근 8장만 표시 (스크롤 대신 슬라이스)
      .map(
        (r) => `
        <div class="revealed-card">
          <img src="${cardImagePath(r.card)}" alt="${r.card.rank}" />
          <span class="muted">${r.byName}</span>
        </div>`,
      )
      .join("");

    // 참여자 목록: 현재 턴 플레이어 강조
    const playersHtml = state.players
      .map(
        (p, i) => `
        <li class="${i === state.turnIndex ? "current-turn" : ""}">
          ${p.name}${i === state.turnIndex ? " ⏳" : ""}
        </li>`,
      )
      .join("");

    // 화면 조립
    this.root.innerHTML = `
      <div class="game-table">
        <header class="game-header">
          <span class="kings">👑 ${state.kingsDrawn} / 4</span>
          <span class="muted">남은 카드 ${state.deckSize}장</span>
        </header>

        <section class="deck-row">${deckHtml}</section>

        <section class="mission-panel">
          ${
            mission && last
              ? `
            <img class="mission-card" src="${cardImagePath(last.card)}" />
            <div>
              <h2>${mission.title}</h2>
              <p>${mission.rule}</p>
              <p class="muted">뽑은 사람: ${last.byName}</p>
            </div>`
              : `<p class="muted">첫 카드를 기다리는 중...</p>`
          }
        </section>

        <section class="revealed-row">${revealedHtml}</section>

        <aside class="players-panel"><ul class="players">${playersHtml}</ul></aside>

        <footer class="game-footer">
          ${
            state.finished
              ? `<p class="finished">게임 종료! 4번째 킹을 뽑은 ${last?.byName ?? ""} 님이 컵을 마셨습니다 🍺</p>`
              : isMyTurn
                ? `<button id="draw-btn">카드 뽑기</button>`
                : `<p class="muted">${state.players[state.turnIndex]?.name ?? ""} 님의 차례입니다...</p>`
          }
        </footer>
      </div>
    `;

    // 뽑기 버튼: 서버에 draw 액션 전송 (검증은 서버가 수행)
    this.root.querySelector("#draw-btn")?.addEventListener("click", () => {
      this.client.send({ type: "action", data: { kind: "draw" } });
    });
  }
}
