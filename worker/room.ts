/**
 * Durable Object: 게임방 (Room)
 * -----------------------------
 * 방 하나 = DO 인스턴스 하나. 방의 모든 상태(참여자, 게임 진행 상황)를
 * 서버(이 객체)가 독점적으로 들고 있어서, 방장이 나가도 게임이 유지되고
 * 클라이언트가 임의로 값을 조작하는 치트도 방지할 수 있습니다.
 *
 * 통신 흐름:
 *   클라이언트 --WebSocket--> fetch()에서 업그레이드 수락
 *   --> onMessage()에서 메시지 처리 --> broadcast()로 전원에게 상태 전송
 */

import type {
  ClientMessage,
  PlayerInfo,
  RoomState,
  ServerMessage,
} from "../src/core/types";
import type { GameModule } from "../src/core/games/hooks";
import { createGame } from "./games"; // gameId → 게임 모듈 팩토리

/** 방 인원 상한 (10명 기획에 맞춤) */
const MAX_PLAYERS = 10;

/** 이 방에 접속 중인 플레이어 (WebSocket → 정보) */
interface Session {
  socket: WebSocket;
  player: PlayerInfo;
}

export class Room implements DurableObject {
  /** 접속 중인 세션 목록 (메모리에 유지 — DO는 방이 살아있는 동안 계속 실행됨) */
  private sessions = new Map<WebSocket, Session>();

  /** 현재 방 상태 (공식 상태. 클라이언트는 이 값의 복사본만 받음) */
  private state: RoomState = {
    roomId: "",
    players: [],
    gameId: null,
    started: false,
  };

  /** 진행 중인 게임 모듈 (게임별 로직을 담당, 미시작이면 null) */
  private game: GameModule | null = null;

  /**
   * fetch(): 클라이언트의 WebSocket 업그레이드 요청을 수락합니다.
   * DO의 생명주기 메서드입니다.
   * 방 코드는 클라이언트가 이미 정해서 전송했으므로 여기서는 그대로 사용합니다.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.state.roomId = url.searchParams.get("roomId")!;

    // WebSocket 연결 수립 (Cloudflare는 서버에서 WebSocketPair로 업그레이드)
    const pair = new WebSocketPair();
    const [clientSocket, serverSocket] = Object.values(pair);

    // 메시지/종료 이벤트 핸들러 등록
    serverSocket.accept(); // 서버 측 소켓 활성화
    serverSocket.addEventListener("message", (event) =>
      this.onMessage(serverSocket, event.data as string),
    );
    serverSocket.addEventListener("close", () => this.onDisconnect(serverSocket));

    // 연결 정보는 아직 없고, join/create 메시지를 기다리는 상태
    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  /**
   * 클라이언트 메시지 처리.
   * 모든 메시지는 JSON 형식이고 types.ts의 ClientMessage 타입을 따릅니다.
   */
  private onMessage(socket: WebSocket, raw: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.send(socket, { type: "error", message: "잘못된 메시지 형식입니다." });
    }

    switch (msg.type) {
      case "create":
        // 방 만들기: 첫 번째 참여자이므로 방장으로 등록
        this.addPlayer(socket, msg.name, true);
        break;
      case "join":
        // 참여하기: 이미 시작된 방이나 가득 찬 방이면 거절
        if (this.state.started) {
          return this.send(socket, { type: "error", message: "이미 시작된 방입니다." });
        }
        if (this.sessions.size >= MAX_PLAYERS) {
          return this.send(socket, { type: "error", message: "방이 가득 찼습니다." });
        }
        this.addPlayer(socket, msg.name, false);
        break;
      case "start":
        // 게임 시작: 방장만 가능. 시작 정보 저장 후 전원에게 상태 전송
        if (!this.isHost(socket)) {
          return this.send(socket, { type: "error", message: "방장만 시작할 수 있습니다." });
        }
        this.state.gameId = msg.gameId;
        this.state.started = true;
        this.broadcastState(); // 1) 먼저 방 상태를 전송해 클라이언트가 게임 화면을 준비하게 함
        // 2) 게임 모듈 생성 (생성자가 초기 게임 상태를 전송)
        //    새 게임 추가 시 worker/games/index.ts에 case만 추가하면 됩니다.
        this.game = createGame(msg.gameId, this.state.players, {
          broadcast: (state) =>
            this.broadcast({ type: "game", gameId: msg.gameId, state }),
          sendTo: (playerId, state) =>
            this.sendToPlayer(playerId, { type: "private", gameId: msg.gameId, state }),
        });
        break;
      case "action": {
        // 게임 진행 액션: 접속한 플레이어 ID를 함께 넘겨 게임 모듈이 검증
        const session = this.sessions.get(socket);
        if (session && this.game) {
          this.game.handleAction(session.player.id, msg.data);
        }
        break;
      }
    }
  }

  /** 플레이어를 방에 추가하고 welcome + 전체 상태를 전송합니다. */
  private addPlayer(socket: WebSocket, name: string, isHost: boolean): void {
    const player: PlayerInfo = {
      id: crypto.randomUUID(), // 연결마다 고유 ID 발급
      name,
      isHost,
    };
    this.sessions.set(socket, { socket, player });
    this.state.players.push(player);

    // 접속자 본인에게는 먼저 본인 ID를 알려줌
    this.send(socket, {
      type: "welcome",
      playerId: player.id,
      roomId: this.state.roomId,
    });
    // 이후 모든 상태 변경은 broadcastState()로 전원에게 동일하게 전달
    this.broadcastState();
  }

  /** 연결 종료 처리: 세션 제거 후, 다시 방장이 필요하면 승계 */
  private onDisconnect(socket: WebSocket): void {
    const session = this.sessions.get(socket);
    if (!session) return;

    this.sessions.delete(socket);
    this.state.players = this.state.players.filter((p) => p.id !== session.player.id);
    // 게임 진행 중이면 게임 모듈에도 퇴장을 알려 턴을 정리합니다
    this.game?.removePlayer(session.player.id);

    // 방장이 나갔고 아직 사람이 남아있다면, 가장 먼저 들어온 사람을 방장으로 승계
    if (session.player.isHost && this.state.players.length > 0) {
      this.state.players[0].isHost = true;
    }

    // 방이 비었으면 상태를 그대로 두면 DO가 정리됩니다
    // (DO는 일정 시간 비활성 후 자동으로 소멸)
    if (this.state.players.length > 0) {
      this.broadcastState();
    }
  }

  /** 현재 방 상태를 JSON으로 직렬화해 전원에게 전송하는 메서드 */
  private broadcastState(): void {
    this.broadcast({ type: "state", state: this.state });
  }

  /** 특정 소켓에만 메시지 전송 */
  private send(socket: WebSocket, msg: ServerMessage): void {
    socket.send(JSON.stringify(msg));
  }

  /** 플레이어 ID로 소켓을 찾아 개인 메시지 전송 (내 패 등 비공개 정보용) */
  private sendToPlayer(playerId: string, msg: ServerMessage): void {
    for (const { socket, player } of this.sessions.values()) {
      if (player.id === playerId) {
        socket.send(JSON.stringify(msg));
        return;
      }
    }
  }

  /** 접속 중인 모든 소켓에 메시지 전송 */
  private broadcast(msg: ServerMessage): void {
    const raw = JSON.stringify(msg);
    for (const { socket } of this.sessions.values()) {
      socket.send(raw);
    }
  }

  /** 해당 소켓이 방장인지 확인 */
  private isHost(socket: WebSocket): boolean {
    return this.sessions.get(socket)?.player.isHost ?? false;
  }
}
