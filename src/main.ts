/**
 * 프론트엔드 진입점
 * ----------------
 * index.html에서 이 파일을 처음 실행합니다.
 * 전체 흐름: GameClient(소켓) 생성 → Lobby(대기실) 시작.
 * 게임이 시작되면 Lobby 대신 게임 룰 모듈 화면으로 교체하는 구조로 확장합니다.
 */

import "./style.css";          // 전역 스타일 불러오기
import { GameClient } from "./net/client";
import { Lobby } from "./ui/lobby";

// index.html에 있는 <div id="app">을 화면 컨테이너로 사용
const root = document.getElementById("app")!;

// 1) 서버와 통신할 클라이언트 생성 (연결은 방 만들기/참여 버튼 눌렀을 때 맺습니다)
const client = new GameClient();

// 2) 대기실 UI 생성 및 시작
const lobby = new Lobby(root, client);
lobby.start();

// 참고: 게임 시작 시 Lobby 대신 게임 룰 화면으로 바꾸려면 여기서
// client.onMessage를 게임 모듈로 넘겨주는 방식으로 확장하면 됩니다.

// 3) Service Worker 등록 (오프라인 플레이 지원 — public/sw.js)
//    배포 환경(https)에서만 동작합니다 (개발 중에는 등록되지 않음).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js");
}
