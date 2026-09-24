/**
 * WebSocket 클라이언트 래퍼
 * -----------------------
 * 브라우저의 WebSocket을 감싸서 편하게 쓰기 위한 클래스입니다.
 * - 접속할 방 코드를 받아서 그 방으로 연결합니다.
 * - 접속 완료(Promise)를 기다린 뒤 메시지를 볼 수 있습니다.
 * - 수신 메시지는 JSON을 자동 파싱해서 types.ts 타입으로 전달합니다.
 */

import type { ClientMessage, ServerMessage } from "../core/types";

/**
 * 6자리 방 코드를 무작위로 생성합니다.
 * 방 만들기는 "클이언트가 코드를 뽑고 → 그 코드로 서버에 접속"하는 방식입니다.
 * (서버가 코드를 만들면 모든 '새 방' 요청이 하나의 서버 객체로 몰리는 문제가
 *  생기기 때문에, 코드 생성은 각 클라이언트가 담당합니다.)
 */
export function generateRoomCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);

  return (buf[0] % 1_000_000)
    .toString()
    .padStart(6, "0");
}

/** WebSocket 주소를 만듭니다. roomId는 접속하려는 방 코드입니다. */
function resolveWsUrl(roomId: string): string {
  // 개발 중(vite dev 서버)이면 같은 오리진의 /ws 사용
  // → vite.config.ts의 프록시 설정이 로컬 wrangler(8787)로 연결해줍니다.
  // 배포 환경이면 현재 도메인의 /ws 사용 (프론트와 워커를 같은 도메인으로 배포).
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws?roomId=${roomId}`;
}

export class GameClient {
  private ws: WebSocket | null = null; // 실제 소켓 (미접속이면 null)

  /** 메시지 핸들러들을 외부에서 등록할 수 있게 열어둡니다 */
  onMessage: (msg: ServerMessage) => void = () => {};
  onClose: () => void = () => {};
  onError: (message: string) => void = () => {};

  /**
   * 서버에 연결합니다.
   * @param roomId 접속할 방 코드 (만들기면 generateRoomCode()로 만든 새 코드)
   * @returns 접속이 완료되면 resolve되는 Promise
   */
  connect(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(resolveWsUrl(roomId));

      // 연결 성공: Promise 완료
      this.ws.onopen = () => resolve();
      // 연결 종료
      this.ws.onclose = () => this.onClose();
      // 메시지 수신: JSON 문자열을 객체로 변환해 전달
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          this.onMessage(msg);
        } catch {
          this.onError("서버 메시지 파싱에 실패했습니다.");
        }
      };
      // 네트워크 오류
      this.ws.onerror = () => {
        this.onError("서버와의 연결에 문제가 발생했습니다.");
        reject(new Error("WebSocket connection failed"));
      };
    });
  }

  /** 서버로 메시지를 전송합니다. 연결이 안 됐으면 무시합니다. */
  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** 연결을 닫습니다. */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
