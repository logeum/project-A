/**
 * Cloudflare Worker 진입점
 * ------------------------
 * 모든 요청이 여기로 들어오고, 경로에 따라 처리합니다.
 * - /ws 로 들어오는 WebSocket 연결 → Durable Object(방)로 전달
 *   (roomId 파라미터로 어느 방에 연결할지 결정)
 * - 그 외 요청 → Vite로 빌드된 정적 웹사이트 파일 제공
 */

import { Room } from "./room"; // 방(Durable Object) 클래스

// wrangler.toml의 [durable_objects] bindings와 이름(ROOM)이 같아야 합니다.
export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

export default {
  /**
   * HTTP/WebSocket 요청 처리기
   * @param request 들어온 요청
   * @param env 환경 (바인딩된 Durable Object 접근용)
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket 연결 요청만 처리
    if (url.pathname === "/ws") {
      // 연결하려는 방 ID (없으면 에러)
      const roomId = url.searchParams.get("roomId");

      if (!roomId) {
        return new Response("roomId is required", { status: 400 });
      }

      // Durable Object 인스턴스 하나 = 게임방 하나
      // idFromName으로 같은 방 코드는 항상 같은 인스턴스를 가리킵니다.
      const id = env.ROOM.idFromName(roomId);
      const room = env.ROOM.get(id);

      // 요청을 그대로 방 객체에 넘깁니다 (WebSocket 업그레이드 처리는 Room에서 수행)
      return room.fetch(request);
    }

    // /ws가 아닌 일반 요청은 Vite로 빌드된 웹사이트를 제공합니다.
    return env.ASSETS.fetch(request);
  },
};

// Durable Object 클래스를 런타임에 등록하기 위해 재export합니다.
export { Room };
