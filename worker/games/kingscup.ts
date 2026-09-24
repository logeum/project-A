/**
 * 킹스 컵 게임 로직 (서버 측)
 * --------------------------
 * Durable Object(Room) 안에서 실행되는 게임 모듈입니다.
 * 게임의 모든 상태(덱, 뽑힌 카드, 턴)는 서버만 알고 있으며,
 * 클라이언트에게는 공개 상태만 전달합니다.
 * → 치트(다른 카드로 바꾸기)가 불가능하고, 누가 나가도 게임이 유지됩니다.
 *
 * 게임 룰 요약:
 *   - 참여자 순서대로 한 장씩 카드를 뽑아 공개합니다.
 *   - 뽑은 카드의 랭크에 해당하는 미션을 수행합니다 (미션 텍스트는 클라이언트 표시용).
 *   - 킹(K)이 4번 뽑히면 게임 종료.
 */

import { buildDeck, shuffle, type Card } from "../../src/core/cards";
import type {
  KingsCupAction,
  KingsCupPlayerView,
  KingsCupPublicState,
} from "../../src/core/games/kingscup";

/** 게임 종료까지 뽑을 수 있는 킹의 수 */
const KINGS_TO_FINISH = 4;

/** 방(Room)이 생성자에 넘겨주는 콜백: 공개 상태를 모든 클라이언트에게 전송하는 함수 */
export type EmitFn = (state: KingsCupPublicState) => void;

export class KingsCupGame {
  /** 비공개: 남은 카드 덱 (배열 끝이 다음에 뽑을 카드) */
  private deck: Card[] = [];
  /** 공개용: 지금까지 뽑힌 카드와 뽑은 사람 */
  private revealed: { card: Card; byName: string }[] = [];
  /** 현재 턴의 players 배열 인덱스 */
  private turnIndex = 0;
  /** 게임 참여자 (진행 순서, 퇴장자는 제거됨) */
  private players: KingsCupPlayerView[];
  /** 뽑힌 킹의 개수 */
  private kingsDrawn = 0;
  /** 게임 종료 여부 */
  private finished = false;

  /**
   * @param players 시작 시점의 참여자 목록 (방의 플레이어 순서)
   * @param emit    상태 변경 시 호출하는 콜백 (Room이 broadcast로 연결)
   */
  constructor(players: KingsCupPlayerView[], private emit: EmitFn) {
    this.players = [...players];
    // 1덱(52장), 조커 없음 — 킹은 4장이므로 4번 뽑기에 정확히 맞습니다
    this.deck = shuffle(buildDeck(1, 0));
    // 초기 상태를 전원에게 전송
    this.emitState();
  }

  /**
   * 플레이어 액션 처리.
   * @param playerId 액션을 전송한 플레이어 ID (검증에 사용)
   * @param data     액션 내용 (KingsCupAction)
   */
  handleAction(playerId: string, data: unknown): void {
    if (this.finished) return; // 종료된 게임은 무시
    const action = data as KingsCupAction;
    if (action?.kind !== "draw") return; // draw 외 액션은 없음

    // 턴 검증: 현재 턴 플레이어만 카드를 뽑을 수 있음 (서버가 권위)
    const current = this.players[this.turnIndex];
    if (!current || current.id !== playerId) return;

    // 카드 뽑기 (덱 끝에서 한 장 제거)
    const card = this.deck.pop();
    if (!card) {
      this.finished = true; // 덱 소진 시 종료
      this.emitState();
      return;
    }
    this.revealed.push({ card, byName: current.name });

    // 킹이면 카운트, 4번째 킹이면 게임 종료
    if (card.rank === "king") {
      this.kingsDrawn++;
      if (this.kingsDrawn >= KINGS_TO_FINISH) {
        this.finished = true;
      }
    }

    // 다음 턴으로 이동 (종료 시에는 유지)
    if (!this.finished) {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    }
    this.emitState();
  }

  /**
   * 플레이어 퇴장 처리 (Room이 연결 종료 시 호출).
   * 퇴장자를 목록에서 제거하고 턴 인덱스를 보정합니다.
   */
  removePlayer(playerId: string): void {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    this.players.splice(idx, 1);
    if (this.players.length === 0) return; // 모두 나가면 상태 전송 불필요
    // 턴 인덱스 보정: 뽑을 차례였던 사람이 나가면 같은 자리의 다음 사람이 이어받음
    if (this.turnIndex >= this.players.length) {
      this.turnIndex = 0;
    } else if (idx < this.turnIndex) {
      this.turnIndex--;
    }
    this.emitState();
  }

  /** 현재 공개 상태를 만들어 emit 콜백으로 전송합니다. */
  private emitState(): void {
    this.emit({
      deckSize: this.deck.length,
      revealed: this.revealed,
      turnIndex: this.turnIndex,
      players: this.players,
      kingsDrawn: this.kingsDrawn,
      finished: this.finished,
    });
  }
}
