/**
 * Service Worker (오프라인 지원)
 * ------------------------------
 * PWA의 핵심으로, 브라우저에 게임 파일(HTML/CSS/JS/카드 이미지)을
 * 캐시해 두었다가 네트워크가 없을 때 캐시에서 불러옵니다.
 * 게임 로직이 모두 클라이언트에서 돌기 때문에 오프라인에서도 실행 가능합니다.
 * (단, 멀티플레이어는 서버 연결이 필요하므로 온라인에서만 플레이됩니다.)
 */

/** 캐시 이름 — 게임 버전을 올릴 때마다 이름을 바꾸면 새 캐시로 교체 됨 */
const CACHE_NAME = "project-a-v1";

/** 설치할 때 캐시할 필수 파일들 (나머지는 실행 중에 추가됨) */
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest"];

/** 설치 단계: 기본 파일들을 캐시에 저장 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting(); // 새 버전 즉시 활성화
});

/** 활성화 단계: 이전 버전 캐시 삭제 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // 모든 탭에서 즉시 제어권 확보
});

/**
 * 요청 가로채기 (fetch)
 * - WebSocket(/ws)는 오프라인 재생 불가 → 네트워크 그대로 사용
 * - 그 외 정적 파일: 먼저 캐시에서 찾고, 없으면 네트워크에서 받아 캐시에 저장
 *   (Cache First 전략 — 게임 파일은 바뀌지 않으므로 유리)
 */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === "/ws") return; // 실시간 통신은 캐시 개입 금지

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          // 성공한 응답만 캐시에 복사해 두고 저장
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
    )
  );
});
