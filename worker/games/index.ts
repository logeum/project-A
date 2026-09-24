/**
 * 게임 모듈 팩토리
 * ----------------
 * gameId에 따라 알맞은 게임 모듈을 생성합니다.
 * 새 게임을 추가할 때: 게임 클래스 작성 → 여기에 case 하나 추가 → 끝.
 * (Room과 Lobby에는 추가 코드가 거의 없습니다.)
 */

import type { GameHooks, GameModule } from "../../src/core/games/hooks";
import { KingsCupGame } from "./kingscup";
import { OneCardGame } from "./onecard";
import { OldMaidGame } from "./oldmaid";
import { HoldemGame } from "./holdem";

/** gameId → 게임 모듈 생성. 알 수 없는 gameId면 null */
export function createGame(
  gameId: string,
  players: { id: string; name: string }[],
  hooks: GameHooks,
): GameModule | null {
  switch (gameId) {
    case "kingscup":
      // 킹스컵은 개인 패가 없어 sendTo를 쓰지 않음 (기존 콜백 시그니처 유지)
      return new KingsCupGame(players, (state) => hooks.broadcast(state));
    case "onecard":
      return new OneCardGame(players, hooks);
    case "oldmaid":
      return new OldMaidGame(players, hooks);
    case "holdem":
      return new HoldemGame(players, hooks);
    default:
      return null;
  }
}
