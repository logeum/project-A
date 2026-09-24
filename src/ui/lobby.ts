/**
 * 대기실 (로비) UI
 * ---------------
 * 게임 시작 전 단계: 닉네임 입력 → 방 만들기 / 방코드로 참여하기 →
 * 참여자 목록 확인 → 방장이 게임 선택 후 시작.
 * 게임 룰 화면은 별도 모듈로 교체 예정이고, 여기서는 "방" 자체를 관리합니다.
 */

import type { RoomState } from "../core/types";
import { generateRoomCode, type GameClient } from "../net/client";

/** 플레이 가능한 게임 목록 (4개 게임 지원을 위한 등록표) */
const GAMES = [
  { id: "kingscup", label: "킹스 컵" },
  { id: "onecard", label: "원카드" },
  { id: "oldmaid", label: "도둑잡기" },
  { id: "holdem", label: "텍사스 홀덤" },
] as const;

export class Lobby {
  private root: HTMLElement;      // 화면을 그릴 컨테이너 (#app)
  private client: GameClient;     // 서버와 통신하는 소켓 클라이언트
  private myId: string | null = null; // 내 플레이어 ID (welcome 메시지로 수신)
  private room: RoomState | null = null; // 최신 방 상태 (state 메시지로 수신)
  private name = "";              // 입력받은 닉네임 (폼 간 이동 시 유지)

  constructor(root: HTMLElement, client: GameClient) {
    this.root = root;
    this.client = client;
    // 서버 메시지 처리 등록
    client.onMessage = (msg) => this.handleMessage(msg);
  }

  /** 화면 시작: 닉네임 입력 화멵만 표시 (소켓 연결은 버튼 클릭 시에 합니다) */
  start(): void {
    this.renderNameForm();
  }

  /** 서버로부터 온 메시지를 종류별로 처리합니다. */
  private handleMessage(msg: Parameters<GameClient["onMessage"]>[0]): void {
    switch (msg.type) {
      case "welcome":
        // 접속 성공: 내 ID와 방 코드를 확인 (이후 state 메시지로 대기실 갱신)
        this.myId = msg.playerId;
        break;
      case "state":
        // 방 상태 갱신: 저장하고 대기실 화면을 다시 그립니다
        this.room = msg.state;
        this.renderWaitingRoom();
        break;
      case "error":
        alert(msg.message);
        break;
    }
  }

  /** 1단계 화면: 닉네임 입력 */
  private renderNameForm(): void {
    this.root.innerHTML = `
      <div class="panel">
        <h1>project-A</h1>
        <input id="name-input" placeholder="닉네임을 입력하세요" maxlength="12" />
        <button id="enter-btn">입장하기</button>
      </div>
    `;
    this.root.querySelector("#enter-btn")!.addEventListener("click", () => {
      const name = (this.root.querySelector("#name-input") as HTMLInputElement).value.trim();
      if (!name) return alert("닉네임을 입력해주세요.");
      this.name = name;
      this.renderRoomForm();
    });
  }

  /**
   * 2단계 화면: 방 만들기 or 방코드로 참여하기.
   * 버튼을 눌러야 비로소 소켓에 연결합니다 (makeOrJoin 참조).
   */
  private renderRoomForm(): void {
    this.root.innerHTML = `
      <div class="panel">
        <h1>project-A</h1>
        <p class="muted">${this.name} 님, 환영합니다!</p>
        <button id="create-btn">방 만들기</button>
        <div class="join-row">
          <input id="room-code" placeholder="방코드 6자리" maxlength="6" />
          <button id="join-btn">참여하기</button>
        </div>
      </div>
    `;
    // 방 만들기: 새 방 코드를 뽑고 그 코드로 접속 → create 요청
    this.root.querySelector("#create-btn")!.addEventListener("click", () => {
      this.makeOrJoin(generateRoomCode(), "create");
    });
    // 방코드로 참여: 입력한 코드로 접속 → join 요청
    this.root.querySelector("#join-btn")!.addEventListener("click", () => {
      const code = (this.root.querySelector("#room-code") as HTMLInputElement).value.trim().toUpperCase();
      if (code.length !== 6) return alert("방코드는 6자리입니다.");
      this.makeOrJoin(code, "join");
    });
  }

  /**
   * 소켓 연결 후 create/join 메시지를 복내는 공통 처리.
   * @param roomId 방 코드 (새 코드이면 내가 방장이 됨)
   * @param kind   "create" | "join"
   */
  private async makeOrJoin(roomId: string, kind: "create" | "join"): Promise<void> {
    try {
      await this.client.connect(roomId);      // 1) 방 코드로 서버 접속
      this.client.send({ type: kind, roomId, name: this.name }); // 2) 입장 요청
    } catch {
      alert("서버에 연결하지 못했습니다.");
    }
  }

  /** 3단계 화면: 대기실 (참여자 목록 + 게임 시작) */
  private renderWaitingRoom(): void {
    if (!this.room) return;

    // 내가 방장인지 확인 (방장만 시작 버튼 활성화)
    const me = this.room.players.find((p) => p.id === this.myId);
    const isHost = me?.isHost ?? false;

    // 참여자 목록 HTML 생성
    const playerList = this.room.players
      .map((p) => `<li>${p.name}${p.isHost ? " 👑" : ""}</li>`)
      .join("");

    // 게임 선택 버튼 HTML 생성 (방장이 아니면 비활성화)
    const gameButtons = GAMES.map(
      (g) => `<button class="game-btn" data-game="${g.id}" ${isHost ? "" : "disabled"}>${g.label}</button>`
    ).join("");

    this.root.innerHTML = `
      <div class="panel">
        <h1>대기실 <span class="muted">코드: ${this.room.roomId}</span></h1>
        <ul class="players">${playerList}</ul>
        <p class="muted">참여자 ${this.room.players.length}명</p>
        <div class="games">${gameButtons}</div>
        ${isHost ? "" : '<p class="muted">방장이 게임을 시작합니다...</p>'}
      </div>
    `;

    // 게임 시작 버튼 클릭 (방장 전용)
    this.root.querySelectorAll(".game-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gameId = (btn as HTMLElement).dataset.game!;
        this.client.send({ type: "start", gameId });
      });
    });
  }
}
