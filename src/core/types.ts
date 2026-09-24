/**
 * 메시지 프로토콜 타입 정의
 * ----------------------
 * 프론트엔드(브라우저)와 워커(Cloudflare Durable Object) 사이에서
 * 주고받는 메시지의 형태를 여기서 하나로 관리합니다.
 * 양쪽이 같은 타입을 쓰면 실수(필드명 오타 등)를 컴파일 시점에 잡을 수 있습니다.
 */

/** 플레이어 한 명의 정보 */
export interface PlayerInfo {
  id: string;   // 연결 고유 ID (소켓 연결 시 서버가 발급)
  name: string; // 닉네임
  isHost: boolean; // 방장 여부 (방장만 게임 시작 가능)
}

/** 진행 중인 방의 상태 (서버가 만들어서 모두에게 전송하는 "공식 상태") */
export interface RoomState {
  roomId: string;         // 방 코드 (예: "A1B2C3")
  players: PlayerInfo[];  // 참여자 목록
  gameId: string | null;  // 선택된 게임 ID (null이면 아직 대기실)
  started: boolean;       // 게임 시작 여부
}

/* ---------- 클라이언트 → 서버 메시지 ---------- */

/** 방 만들기 요청 (첫 접속자가 방장이 됨) */
export interface CreateMsg {
  type: "create";
  name: string; // 내 닉네임
}

/** 기존 방 참여 요청 */
export interface JoinMsg {
  type: "join";
  roomId: string; // 6자리 방 코드
  name: string;
}

/** 게임 시작 요청 (방장만 유효) */
export interface StartMsg {
  type: "start";
  gameId: string; // 어떤 게임을 시작할지 ("kingscup" | "onecard" | ...)
}

/** 게임 진행 중 액션 (카드 내기 등 — 게임별로 data 내용이 다름) */
export interface ActionMsg {
  type: "action";
  data: unknown; // 게임 룰 모듈이 해석
}

/** 클라이언트가 볼 수 있는 모든 요청 메시지의 합집합 */
export type ClientMessage = CreateMsg | JoinMsg | StartMsg | ActionMsg;

/* ---------- 서버 → 클라이언트 메시지 ---------- */

/** 내 연결 정보 (접속 직후 서버가 1회 전송) */
export interface WelcomeMsg {
  type: "welcome";
  playerId: string;
  roomId: string;
}

/** 방 상태 전체 갱신 (누군가 들어오거나 상태가 바뀔 때마다 전원에게 전송) */
export interface StateMsg {
  type: "state";
  state: RoomState;
}

/**
 * 게임 진행 상태 (started 이후 서버가 전원에게 전송).
 * state는 게임별 커스텀 타입 (예: KingsCupPublicState)으로,
 * 클라이언트는 gameId를 보고 어떤 게임 화면을 켤지 결정합니다.
 */
export interface GameStateMsg {
  type: "game";
  gameId: string;
  state: unknown;
}

/**
 * 개인 전용 상태 (본인에게만 전송).
 * 다른 플레이어에게는 절대 전송되지 않으므로, 내 패(손패) 같은
 * 비공개 정보를 담는 데 사용합니다.
 */
export interface PrivateStateMsg {
  type: "private";
  gameId: string;
  state: unknown; // 보통 { hand: Card[] } 형태
}

/** 에러/안내 메시지 */
export interface ErrorMsg {
  type: "error";
  message: string;
}

/** 서버가 볼 수 있는 모든 응답 메시지의 합집합 */
export type ServerMessage =
  | WelcomeMsg
  | StateMsg
  | ErrorMsg
  | GameStateMsg
  | PrivateStateMsg;
