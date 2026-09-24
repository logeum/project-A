/**
 * 게임 모듈 ↔ 방(Room) 통신 콜백
 * -----------------------------
 * 모든 게임 모듈은 생성 시 이 인터페이스를 전달받습니다.
 * - broadcast: 공개 상태 (전원에게 동일하게 전송)
 * - sendTo: 개인 상태 (해당 플레이어에게만 전송 — 내 패 등)
 * Room이 실제 소켓 전송을 담당하고, 게임 모듈은 이 콜백만 사용합니다.
 */

export interface GameHooks {
  /** 공개 상태를 방의 모든 플레이어에게 전송합니다 */
  broadcast(state: unknown): void;
  /** 개인 상태를 특정 플레이어에게만 전송합니다 (비공개 정보용) */
  sendTo(playerId: string, state: unknown): void;
}

/** 모든 게임 모듈이 구현하는 공통 인터페이스 (Room이 호출) */
export interface GameModule {
  /** 플레이어 액션 처리 (게임이 턴/규칙을 검증) */
  handleAction(playerId: string, data: unknown): void;
  /** 플레이어 퇴장 처리 */
  removePlayer(playerId: string): void;
}

/** 모든 게임 화면이 구현하는 공통 인터페이스 (Lobby가 호출) */
export interface GameUI {
  /** 공개 게임 상태 수신 → 화면 다시 그리기 */
  handleGame(state: unknown): void;
  /** 개인 상태 수신 (내 패 등, 선택적) */
  handlePrivate?(state: unknown): void;
}
