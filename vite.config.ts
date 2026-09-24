import { defineConfig } from "vite";

// Vite 설정: 프론트엔드 개발 서버와 빌드 옵션을 정의합니다.
export default defineConfig({
  server: {
    port: 5173, // 로컬 개발 서버 포트 (http://localhost:5173)
    proxy: {
      // 개발 중에 워커(WebSocket)로의 요청을 로컬 wrangler로 전달합니다.
      // 브라우저는 5173에 붙지만, /ws 요청은 8787(wrangler dev)으로 프록시됩니다.
      "/ws": {
        target: "ws://localhost:8787",
        ws: true, // WebSocket 프록시 활성화
      },
    },
  },
});
